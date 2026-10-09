import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EmailAccount, Prisma, UserEmailAccount, UserRole } from '../../generated/prisma/client';
import { UserCredentials, UserIdentity, userAuthenticatedIdentitySelect, userCredentialsSelect, userIdentitySelect } from './user-projections';
import { IdentityConflictError, InvalidIdentityError } from './identity.errors';
import { normalizeEmail, normalizeIdentityText } from './identity-normalization';
import { generateUsername, USERNAME_MAX_ATTEMPTS } from './username';
import { AdministrationError } from './administration.errors';

// Clave estable CECASEM (1128612691), administración (1). Compartida con bootstrap.
export const ADMINISTRATION_LOCK_NAMESPACE = 1128612691;
export const ADMINISTRATION_LOCK_KEY = 1;

export interface CreateUserIdentity {
  givenNames: string;
  familyNames: string;
  email: string;
  role: UserRole;
  passwordHash?: string;
  mustChangePassword?: boolean;
}

export interface CreateAvailableEmailAccount {
  address: string;
  displayName: string;
  provider?: string;
}

function uniqueConflict(error: unknown, fields: readonly string[], index: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  if (Array.isArray(target)) return fields.every((field) => target.includes(field));

  // Prisma 7 + adapter-pg informa el índice dentro del error estructurado del driver.
  // No inspeccionar mensajes SQL: pueden contener información de la identidad.
  const adapterError = error.meta?.driverAdapterError;
  if (typeof adapterError !== 'object' || adapterError === null || !('cause' in adapterError)) return false;
  const cause = adapterError.cause;
  if (typeof cause !== 'object' || cause === null || !('constraint' in cause)) return false;
  const constraint = cause.constraint;
  return typeof constraint === 'object' && constraint !== null && 'index' in constraint && constraint.index === index;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Selección de equipo CECASEM: nombres e IDs, sin credenciales ni administración. */
  async meetingCandidates(search: string, page: number, pageSize: number, tx: Prisma.TransactionClient) {
    const where = { isActive: true, OR: [{ givenNames: { contains: search, mode: 'insensitive' as const } }, { familyNames: { contains: search, mode: 'insensitive' as const } }] };
    const rows = await tx.user.findMany({ where, select: { id: true, givenNames: true, familyNames: true, isActive: true }, orderBy: [{ givenNames: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize });
    return { items: rows.map(row => ({ id: row.id, displayName: row.givenNames + ' ' + row.familyNames, isActive: row.isActive })), total: await tx.user.count({ where }), page, pageSize };
  }

  // Destinatarios actuales; los locks preservan esta selección hasta confirmar el lote.
  opportunityNotificationRecipients(tx: Prisma.TransactionClient): Promise<{ id: string }[]> {
    return tx.$queryRaw`SELECT id FROM "User" WHERE "isActive" = true
      AND role IN ('ADMINISTRATOR', 'BOARD', 'PLANNING') ORDER BY id FOR SHARE`;
  }

  /** Solo identidades candidatas; fija actividad/rol hasta confirmar la entrega. */
  notificationCandidates(ids: string[], tx: Prisma.TransactionClient): Promise<{ id: string; role: UserRole }[]> {
    if (!ids.length) return Promise.resolve([]);
    return tx.$queryRaw`SELECT id, role FROM "User" WHERE "isActive" = true
      AND id = ANY(${ids}::uuid[]) ORDER BY id FOR SHARE`;
  }

  /** Unión institucional/contextual en un único orden de locks; nunca concede acceso. */
  institutionalNotificationCandidates(ids: string[], tx: Prisma.TransactionClient): Promise<{ id: string; role: UserRole }[]> {
    return tx.$queryRaw`SELECT id, role FROM "User" WHERE "isActive" = true
      AND (role IN ('ADMINISTRATOR', 'BOARD') OR id = ANY(${ids}::uuid[])) ORDER BY id FOR SHARE`;
  }

  // Interfaz interna para crear identidad y, si se proporciona, guardar un hash inicial.
  async createIdentity(input: CreateUserIdentity, transaction?: Prisma.TransactionClient): Promise<UserIdentity> {
    const givenNames = normalizeIdentityText(input.givenNames, 'Nombres');
    const familyNames = normalizeIdentityText(input.familyNames, 'Apellidos');
    const email = normalizeEmail(input.email);
    if (!Object.values(UserRole).includes(input.role)) {
      throw new InvalidIdentityError('Debe elegirse un rol válido explícitamente.');
    }

    for (let attempt = 1; attempt <= USERNAME_MAX_ATTEMPTS; attempt++) {
      if (transaction) await transaction.$executeRaw`SAVEPOINT identity_username`;
      try {
        const identity = await (transaction ?? this.prisma).user.create({
          select: userIdentitySelect,
          data: { givenNames, familyNames, email, role: input.role,
            username: generateUsername(givenNames, familyNames, attempt), passwordHash: input.passwordHash ?? null,
            mustChangePassword: input.mustChangePassword ?? false },
        });
        if (transaction) await transaction.$executeRaw`RELEASE SAVEPOINT identity_username`;
        return identity;
      } catch (error) {
        if (transaction) {
          await transaction.$executeRaw`ROLLBACK TO SAVEPOINT identity_username`;
          await transaction.$executeRaw`RELEASE SAVEPOINT identity_username`;
        }
        if (uniqueConflict(error, ['email'], 'User_email_key')) throw new IdentityConflictError('EMAIL_EXISTS');
        if (!uniqueConflict(error, ['username'], 'User_username_key')) throw error;
        // Sin tx cada INSERT es independiente; con tx el savepoint recupera la
        // colisión sin abortar la creación administrativa/bootstrap completa.
      }
    }
    throw new IdentityConflictError('USERNAME_EXHAUSTED');
  }

  findByEmail(email: string): Promise<UserIdentity | null> {
    return this.prisma.user.findUnique({ where: { email: normalizeEmail(email) }, select: userIdentitySelect });
  }

  findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({ where: { email: normalizeEmail(email) }, select: userCredentialsSelect });
  }

  findIdentityById(id: string, tx: Prisma.TransactionClient = this.prisma): Promise<UserIdentity | null> {
    return tx.user.findUnique({ where: { id }, select: userIdentitySelect });
  }

  findAuthenticatedIdentityById(id: string, tx: Prisma.TransactionClient = this.prisma) {
    return tx.user.findUnique({ where: { id }, select: userAuthenticatedIdentitySelect });
  }

  findCredentialsById(id: string): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({ where: { id }, select: userCredentialsSelect });
  }

  // El propietario de User controla el lock. El callback permite coordinar sesiones
  // en la misma transacción, sin acoplar UsersModule a AuthModule.
  withLockedCredentials<T>(id: string, operation: (user: UserCredentials | null, tx: Prisma.TransactionClient) => Promise<T>,
    locks: { actorId?: string; administrators?: boolean } = {}): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      if (locks.administrators) await this.lockAdministration(tx);
      const ids = [...new Set([id, ...(locks.actorId ? [locks.actorId] : [])])].sort();
      // No se modifica la PK. NO KEY UPDATE serializa credenciales/roles y sigue
      // incompatible con FOR SHARE de destinatarios, pero permite FK KEY SHARE
      // de historial: evita User → Directory → FK User sin relajar autorización.
      for (const lockedId of ids) await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${lockedId}::uuid FOR NO KEY UPDATE`;
      const user = await tx.user.findUnique({ where: { id }, select: userCredentialsSelect });
      return operation(user, tx);
    });
  }

  async lockAdministration(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${ADMINISTRATION_LOCK_NAMESPACE}, ${ADMINISTRATION_LOCK_KEY})::text`;
  }

  withInitialBootstrap<T>(operation: (user: UserCredentials | null, tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async tx => {
      const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(${ADMINISTRATION_LOCK_NAMESPACE}, ${ADMINISTRATION_LOCK_KEY}) AS acquired`;
      if (!lock.acquired) throw new AdministrationError('BOOTSTRAP_BUSY');
      await tx.$queryRaw`SELECT id FROM "User" ORDER BY id FOR UPDATE`;
      const users = await tx.user.findMany({ select: userCredentialsSelect, take: 2 });
      if (users.length > 1) throw new AdministrationError('BOOTSTRAP_UNAVAILABLE');
      const user = users[0] ?? null;
      if (user && (!user.isActive || user.role !== UserRole.ADMINISTRATOR || user.passwordHash !== null)) {
        throw new AdministrationError('BOOTSTRAP_UNAVAILABLE');
      }
      return operation(user, tx);
    });
  }

  withAdministrationLocks<T>(actorId: string, targetId: string | undefined,
    operation: (user: UserCredentials | null, tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.withLockedCredentials(targetId ?? actorId, operation, { actorId, administrators: true });
  }

  async protectLastAdministrator(user: UserIdentity, tx: Prisma.TransactionClient): Promise<void> {
    if (user.isActive && user.role === UserRole.ADMINISTRATOR &&
      await tx.user.count({ where: { isActive: true, role: UserRole.ADMINISTRATOR } }) <= 1) {
      throw new AdministrationError('LAST_ADMINISTRATOR');
    }
  }

  listAdministrativeUsers(status: 'active' | 'inactive' | 'all') {
    return this.prisma.user.findMany({ where: status === 'all' ? {} : { isActive: status === 'active' },
      select: userCredentialsSelect, orderBy: [{ familyNames: 'asc' }, { givenNames: 'asc' }, { id: 'asc' }] });
  }

  async changeRoleLocked(id: string, role: UserRole, tx: Prisma.TransactionClient): Promise<void> {
    await tx.user.update({ where: { id }, data: { role } });
  }

  async updateAdministrativeProfileLocked(id: string, input: { givenNames: string; familyNames: string; email: string },
    tx: Prisma.TransactionClient): Promise<UserCredentials> {
    const givenNames = normalizeIdentityText(input.givenNames, 'Nombres');
    const familyNames = normalizeIdentityText(input.familyNames, 'Apellidos');
    const email = normalizeEmail(input.email);
    try {
      return await tx.user.update({ where: { id }, data: { givenNames, familyNames, email }, select: userCredentialsSelect });
    } catch (error) {
      if (uniqueConflict(error, ['email'], 'User_email_key')) throw new IdentityConflictError('EMAIL_EXISTS');
      throw error;
    }
  }

  async assignAdministrativePasswordLocked(id: string, passwordHash: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
  }

  async reactivateLocked(id: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.user.update({ where: { id }, data: { isActive: true, deactivatedAt: null } });
  }

  async replaceCredentialIfUnchanged(id: string, previous: string, replacement: string, tx: Prisma.TransactionClient): Promise<boolean> {
    const result = await tx.user.updateMany({ where: { id, passwordHash: previous }, data: { passwordHash: replacement } });
    return result.count === 1;
  }

  async replaceCredentialAndClearChangeRequirement(id: string, previous: string, replacement: string, tx: Prisma.TransactionClient): Promise<boolean> {
    const result = await tx.user.updateMany({ where: { id, passwordHash: previous }, data: { passwordHash: replacement, mustChangePassword: false } });
    return result.count === 1;
  }

  async replaceRequiredPassword(id: string, previous: string, replacement: string, tx: Prisma.TransactionClient): Promise<boolean> {
    const result = await tx.user.updateMany({ where: { id, passwordHash: previous, mustChangePassword: true },
      data: { passwordHash: replacement, mustChangePassword: false } });
    return result.count === 1;
  }

  async establishInitialPassword(id: string, passwordHash: string, tx: Prisma.TransactionClient): Promise<boolean> {
    const result = await tx.user.updateMany({ where: { id, isActive: true, passwordHash: null },
      data: { passwordHash, mustChangePassword: false } });
    return result.count === 1;
  }

  async assignAdministratorInitialPassword(id: string, passwordHash: string, tx: Prisma.TransactionClient): Promise<boolean> {
    const result = await tx.user.updateMany({ where: { id, isActive: true, passwordHash: null },
      data: { passwordHash, mustChangePassword: true } });
    return result.count === 1;
  }

  async deactivateLocked(id: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.user.updateMany({ where: { id, isActive: true }, data: { isActive: false, deactivatedAt: new Date() } });
  }

  async createEmailAccount(input: CreateAvailableEmailAccount, tx: Prisma.TransactionClient = this.prisma): Promise<EmailAccount> {
    const address = normalizeEmail(input.address);
    const displayName = normalizeIdentityText(input.displayName, 'Nombre de la cuenta');
    const provider = input.provider === undefined ? null : normalizeIdentityText(input.provider, 'Proveedor');
    try {
      return await tx.emailAccount.create({ data: { address, displayName, provider } });
    } catch (error) {
      if (uniqueConflict(error, ['address'], 'EmailAccount_address_key')) throw new IdentityConflictError('ACCOUNT_EXISTS');
      throw error;
    }
  }

  listEmailAccounts() {
    return this.prisma.emailAccount.findMany({ where: { isActive: true }, orderBy: [{ address: 'asc' }, { id: 'asc' }] });
  }

  /** Lectura operativa pública: solo buzones activos asignados; no expone datos administrativos. */
  async availableCommunicationAccounts(userId: string, tx: Prisma.TransactionClient) {
    const rows = await tx.userEmailAccount.findMany({ where: { userId, removedAt: null, emailAccount: { isActive: true } },
      select: { emailAccount: { select: { id: true, address: true, displayName: true } } }, orderBy: { emailAccountId: 'asc' } });
    return rows.map(row => row.emailAccount);
  }
  /** Vinculación auxiliar de destinatarios observados; no exige actividad ni asignación. */
  matchingCommunicationAccounts(addresses: string[], tx: Prisma.TransactionClient) {
    return tx.emailAccount.findMany({ where: { address: { in: addresses } }, select: { id: true, address: true, displayName: true } });
  }

  /** Después del lock de usuario: estabiliza cuenta/asignación hasta commit. */
  async lockCommunicationAccount(userId: string, emailAccountId: string, tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT id FROM "EmailAccount" WHERE id=${emailAccountId}::uuid FOR SHARE`;
    await tx.$queryRaw`SELECT "userId" FROM "UserEmailAccount" WHERE "userId"=${userId}::uuid AND "emailAccountId"=${emailAccountId}::uuid FOR SHARE`;
    const row = await tx.userEmailAccount.findUnique({ where: { userId_emailAccountId: { userId, emailAccountId } },
      select: { removedAt: true, emailAccount: { select: { id: true, address: true, displayName: true, isActive: true } } } });
    return row && row.removedAt === null && row.emailAccount.isActive ? row.emailAccount : null;
  }

  async assignedEmailAccounts(userId: string) {
    if (!await this.findIdentityById(userId)) throw new AdministrationError('USER_NOT_FOUND');
    return this.prisma.userEmailAccount.findMany({ where: { userId, removedAt: null },
      select: { createdAt: true, emailAccount: true }, orderBy: { emailAccountId: 'asc' } });
  }

  async setMailboxLocked(userId: string, emailAccountId: string, assigned: boolean, tx: Prisma.TransactionClient): Promise<boolean> {
    const account = await tx.emailAccount.findUnique({ where: { id: emailAccountId } });
    if (!account) throw new AdministrationError('ACCOUNT_NOT_FOUND');
    if (assigned && !account.isActive) throw new AdministrationError('ACCOUNT_INACTIVE');
    const where = { userId_emailAccountId: { userId, emailAccountId } };
    const current = await tx.userEmailAccount.findUnique({ where });
    if (assigned) {
      if (current && current.removedAt === null) return false;
      if (current) await tx.userEmailAccount.update({ where, data: { removedAt: null } });
      else await tx.userEmailAccount.create({ data: { userId, emailAccountId } });
    } else {
      if (!current || current.removedAt !== null) return false;
      await tx.userEmailAccount.update({ where, data: { removedAt: new Date(Math.max(Date.now(), +current.createdAt)) } });
    }
    return true;
  }

  async assignEmailAccount(userId: string, emailAccountId: string): Promise<UserEmailAccount> {
    try {
      return await this.prisma.userEmailAccount.create({ data: { userId, emailAccountId } });
    } catch (error) {
      if (uniqueConflict(error, ['userId', 'emailAccountId'], 'UserEmailAccount_pkey')) {
        throw new IdentityConflictError('ASSIGNMENT_EXISTS');
      }
      throw error;
    }
  }
}
