import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EmailAccount, Prisma, UserEmailAccount, UserRole } from '../../generated/prisma/client';
import { UserCredentials, UserIdentity, userCredentialsSelect, userIdentitySelect } from './user-projections';
import { IdentityConflictError, InvalidIdentityError } from './identity.errors';
import { normalizeEmail, normalizeIdentityText } from './identity-normalization';
import { generateUsername, USERNAME_MAX_ATTEMPTS } from './username';

export interface CreateUserIdentity {
  givenNames: string;
  familyNames: string;
  email: string;
  role: UserRole;
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

  // Interfaz interna; no crea credenciales ni expone administración HTTP.
  async createIdentity(input: CreateUserIdentity): Promise<UserIdentity> {
    const givenNames = normalizeIdentityText(input.givenNames, 'Nombres');
    const familyNames = normalizeIdentityText(input.familyNames, 'Apellidos');
    const email = normalizeEmail(input.email);
    if (!Object.values(UserRole).includes(input.role)) {
      throw new InvalidIdentityError('Debe elegirse un rol válido explícitamente.');
    }

    for (let attempt = 1; attempt <= USERNAME_MAX_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.user.create({
          select: userIdentitySelect,
          data: { givenNames, familyNames, email, role: input.role,
            username: generateUsername(givenNames, familyNames, attempt) },
        });
      } catch (error) {
        if (uniqueConflict(error, ['email'], 'User_email_key')) throw new IdentityConflictError('EMAIL_EXISTS');
        if (!uniqueConflict(error, ['username'], 'User_username_key')) throw error;
        // Cada INSERT es independiente: una colisión no deja una transacción abortada.
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

  // El propietario de User controla el lock. El callback permite coordinar sesiones
  // en la misma transacción, sin acoplar UsersModule a AuthModule.
  withLockedCredentials<T>(id: string, operation: (user: UserCredentials | null, tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id }, select: userCredentialsSelect });
      return operation(user, tx);
    });
  }

  async replaceCredentialIfUnchanged(id: string, previous: string, replacement: string, tx: Prisma.TransactionClient): Promise<boolean> {
    const result = await tx.user.updateMany({ where: { id, passwordHash: previous }, data: { passwordHash: replacement } });
    return result.count === 1;
  }

  async establishInitialPassword(id: string, passwordHash: string, tx: Prisma.TransactionClient): Promise<boolean> {
    const result = await tx.user.updateMany({ where: { id, isActive: true, passwordHash: null }, data: { passwordHash } });
    return result.count === 1;
  }

  async deactivateLocked(id: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.user.updateMany({ where: { id, isActive: true }, data: { isActive: false, deactivatedAt: new Date() } });
  }

  async createEmailAccount(input: CreateAvailableEmailAccount): Promise<EmailAccount> {
    const address = normalizeEmail(input.address);
    const displayName = normalizeIdentityText(input.displayName, 'Nombre de la cuenta');
    const provider = input.provider === undefined ? null : normalizeIdentityText(input.provider, 'Proveedor');
    try {
      return await this.prisma.emailAccount.create({ data: { address, displayName, provider } });
    } catch (error) {
      if (uniqueConflict(error, ['address'], 'EmailAccount_address_key')) throw new IdentityConflictError('ACCOUNT_EXISTS');
      throw error;
    }
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
