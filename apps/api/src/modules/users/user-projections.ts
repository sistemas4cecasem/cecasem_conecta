import { Prisma } from '../../generated/prisma/client';

export const userIdentitySelect = {
  id: true, givenNames: true, familyNames: true, username: true, email: true,
  role: true, isActive: true, createdAt: true, updatedAt: true, deactivatedAt: true,
} satisfies Prisma.UserSelect;

export const userAuthenticatedIdentitySelect = { ...userIdentitySelect, mustChangePassword: true } satisfies Prisma.UserSelect;
export type UserAuthenticatedIdentity = Omit<UserIdentity, 'mustChangePassword'> & { mustChangePassword?: boolean };

// Única proyección del módulo que incluye el hash. Nunca es un contrato HTTP.
export const userCredentialsSelect = { ...userAuthenticatedIdentitySelect, passwordHash: true } satisfies Prisma.UserSelect;
export type UserIdentity = Prisma.UserGetPayload<{ select: typeof userIdentitySelect }>;
export type UserCredentials = Prisma.UserGetPayload<{ select: typeof userCredentialsSelect }>;
