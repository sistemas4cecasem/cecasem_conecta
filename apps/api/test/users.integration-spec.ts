import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { AppEnvironment, validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { EmailAccount, UserRole } from '../src/generated/prisma/client';
import { UserIdentity as User } from '../src/modules/users/user-projections';
import { UsersService } from '../src/modules/users/users.service';

// Esta suite escribe datos: falla antes de conectar si la base no es de pruebas.
const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('La integración de identidades requiere una base dedicada con nombre terminado en _test.');
}

describe('User identities with real PostgreSQL', () => {
  let prisma: PrismaService;
  let users: UsersService;
  let sql: Pool;
  let closeModule: () => Promise<void>;
  const userIds: string[] = [];
  const accountIds: string[] = [];
  const fixtureNames = `Fixture${randomUUID().replace(/-/g, '')}`;
  let sequence = 0;

  async function createUser(overrides: Partial<{ givenNames: string; familyNames: string; email: string; role: UserRole }> = {}): Promise<User> {
    const user = await users.createIdentity({
      givenNames: fixtureNames, familyNames: `Persona${++sequence}`,
      email: `${randomUUID()}@example.test`, role: UserRole.RESEARCH, ...overrides,
    });
    userIds.push(user.id);
    return user;
  }

  async function createAccount(): Promise<EmailAccount> {
    const account = await users.createEmailAccount({ address: `${randomUUID()}@example.test`, displayName: 'Buzón de pruebas' });
    accountIds.push(account.id);
    return account;
  }

  beforeAll(async () => {
    const config = new ConfigService<AppEnvironment, true>(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService).useValue(config).compile();
    closeModule = () => moduleRef.close();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    sql = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  });

  afterEach(async () => {
    if (!prisma) return;
    // Solo filas creadas por esta prueba. Nunca TRUNCATE ni borrado global.
    await prisma.$transaction([
      prisma.userEmailAccount.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
      prisma.emailAccount.deleteMany({ where: { id: { in: accountIds } } }),
    ]);
    userIds.length = 0;
    accountIds.length = 0;
  });

  afterAll(async () => {
    try { await sql?.end(); } finally { await closeModule?.(); }
  });

  it('creates a normalized active identity with database-generated UUID and timestamps', async () => {
    const email = `${randomUUID()}@example.test`;
    const user = await createUser({ givenNames: ' Diego  Armando ', familyNames: ' Fariñas Ávila ', email: `  ${email.toUpperCase()}  ` });
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(user).toMatchObject({ givenNames: 'Diego Armando', familyNames: 'Fariñas Ávila', username: 'diego.farinas', email,
      isActive: true, deactivatedAt: null, role: UserRole.RESEARCH });
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
    expect(await users.findByEmail(` ${email.toUpperCase()} `)).toMatchObject({ id: user.id });
  });

  it.each(Object.values(UserRole))('persists the explicitly selected role %s', async (role) => {
    expect((await createUser({ role })).role).toBe(role);
  });

  it('rejects an omitted role in PostgreSQL without a default', async () => {
    const id = randomUUID();
    userIds.push(id);
    await expect(sql.query('INSERT INTO "User" (id, "givenNames", "familyNames", username, email) VALUES ($1, $2, $3, $4, $5)',
      [id, 'Ana', 'Pérez', 'ana.perez', `${randomUUID()}@example.test`])).rejects.toMatchObject({ code: '23502' });
  });

  it('rejects a role outside the persistent enum', async () => {
    const id = randomUUID();
    userIds.push(id);
    await expect(sql.query('INSERT INTO "User" (id, "givenNames", "familyNames", username, email, role) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, 'Ana', 'Pérez', 'ana.perez', `${randomUUID()}@example.test`, 'UNKNOWN'])).rejects.toMatchObject({ code: '22P02' });
  });

  it('rejects a normalized duplicate login email at the service and database boundaries', async () => {
    const first = await createUser();
    await expect(createUser({ email: ` ${first.email.toUpperCase()} ` })).rejects.toMatchObject({ code: 'EMAIL_EXISTS' });
    await expect(prisma.user.create({ data: { givenNames: 'Otra', familyNames: 'Persona', username: `other.${randomUUID().replace(/-/g, '')}`,
      email: first.email, role: UserRole.BOARD } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a duplicate username even when bypassing generation', async () => {
    const first = await createUser();
    await expect(prisma.user.create({ data: { givenNames: 'Otra', familyNames: 'Persona', username: first.username,
      email: `${randomUUID()}@example.test`, role: UserRole.PLANNING } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('resolves concurrent collisions through unique constraints and bounded retries', async () => {
    const familyNames = `Concurrent${++sequence}`;
    // Esperar también los intentos fallidos antes de limpiar sus fixtures.
    const settled = await Promise.allSettled(Array.from({ length: 5 }, () => createUser({ familyNames })));
    const created = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    expect(created).toHaveLength(5);
    const base = `${fixtureNames.toLowerCase().slice(0, 30)}.${familyNames.toLowerCase()}`;
    expect(created.map((user) => user.username).sort()).toEqual([base, `${base}2`, `${base}3`, `${base}4`, `${base}5`].sort());
  });

  it.each([
    { isActive: false, deactivatedAt: null },
    { isActive: true, deactivatedAt: new Date() },
  ])('rejects incoherent state $isActive/$deactivatedAt', async (state) => {
    const user = await createUser();
    await expect(sql.query('UPDATE "User" SET "isActive" = $1, "deactivatedAt" = $2 WHERE id = $3',
      [state.isActive, state.deactivatedAt, user.id])).rejects.toMatchObject({ code: '23514', constraint: 'User_active_deactivation_check' });
  });

  it('rejects noncanonical email writes in PostgreSQL', async () => {
    const user = await createUser();
    await expect(sql.query('UPDATE "User" SET email = $1 WHERE id = $2', [` ${user.email.toUpperCase()} `, user.id]))
      .rejects.toMatchObject({ code: '23514', constraint: 'User_email_normalized_check' });
  });

  it('creates a normalized mailbox with flexible optional provider and no credentials', async () => {
    const address = `${randomUUID()}.outreach+project@example.test`;
    const account = await users.createEmailAccount({ address: ` ${address.toUpperCase()} `, displayName: ' Cooperación ', provider: 'Servidor institucional propio' });
    accountIds.push(account.id);
    expect(account).toMatchObject({ address, displayName: 'Cooperación', provider: 'Servidor institucional propio', isActive: true });
    expect(account.id).toMatch(/^[0-9a-f-]{36}$/u);
    expect((await createAccount()).provider).toBeNull();
    expect(Object.keys(account).sort()).toEqual(['address', 'createdAt', 'displayName', 'id', 'isActive', 'provider', 'updatedAt'].sort());
  });

  it('rejects a duplicate mailbox by normalized address', async () => {
    const account = await createAccount();
    await expect(users.createEmailAccount({ address: ` ${account.address.toUpperCase()} `, displayName: 'Otra descripción' }))
      .rejects.toMatchObject({ code: 'ACCOUNT_EXISTS' });
    await expect(prisma.emailAccount.create({ data: { address: account.address, displayName: 'Duplicado directo' } }))
      .rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects noncanonical mailbox writes in PostgreSQL', async () => {
    const account = await createAccount();
    await expect(sql.query('UPDATE "EmailAccount" SET address = $1 WHERE id = $2', [` ${account.address.toUpperCase()} `, account.id]))
      .rejects.toMatchObject({ code: '23514', constraint: 'EmailAccount_address_normalized_check' });
  });

  it('supports many users per mailbox and many mailboxes per user without duplicate pairs', async () => {
    const first = await createUser();
    const second = await createUser();
    const shared = await createAccount();
    const other = await createAccount();
    const assignment = await users.assignEmailAccount(first.id, shared.id);
    expect(assignment.createdAt).toBeInstanceOf(Date);
    await users.assignEmailAccount(second.id, shared.id);
    await users.assignEmailAccount(first.id, other.id);
    expect(await prisma.userEmailAccount.count({ where: { userId: first.id } })).toBe(2);
    expect(await prisma.userEmailAccount.count({ where: { emailAccountId: shared.id } })).toBe(2);
    await expect(users.assignEmailAccount(first.id, shared.id)).rejects.toMatchObject({ code: 'ASSIGNMENT_EXISTS' });
    await expect(prisma.userEmailAccount.create({ data: { userId: first.id, emailAccountId: shared.id } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('enforces foreign keys and restricts deletion of referenced identities and mailboxes', async () => {
    const user = await createUser();
    const account = await createAccount();
    await expect(users.assignEmailAccount(randomUUID(), account.id)).rejects.toMatchObject({ code: 'P2003' });
    await expect(users.assignEmailAccount(user.id, randomUUID())).rejects.toMatchObject({ code: 'P2003' });
    await users.assignEmailAccount(user.id, account.id);
    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.emailAccount.delete({ where: { id: account.id } })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('preserves IDs, associations and unique identity values after ordinary state changes', async () => {
    const user = await createUser();
    const account = await createAccount();
    await users.assignEmailAccount(user.id, account.id);
    const deactivatedAt = new Date();
    const inactive = await prisma.user.update({ where: { id: user.id }, data: { isActive: false, deactivatedAt } });
    await prisma.emailAccount.update({ where: { id: account.id }, data: { isActive: false } });
    expect(inactive).toMatchObject({ id: user.id, username: user.username, email: user.email, isActive: false, deactivatedAt });
    expect(await prisma.userEmailAccount.count({ where: { userId: user.id, emailAccountId: account.id } })).toBe(1);
    await expect(createUser({ email: user.email })).rejects.toMatchObject({ code: 'EMAIL_EXISTS' });
    const next = await createUser({ givenNames: user.givenNames, familyNames: user.familyNames });
    expect(next.username).toBe(`${user.username}2`);
    await expect(users.createEmailAccount({ address: account.address, displayName: 'Reutilización' })).rejects.toMatchObject({ code: 'ACCOUNT_EXISTS' });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true, deactivatedAt: null } });
    expect(await prisma.userEmailAccount.count({ where: { userId: user.id } })).toBe(1);
  });
});
