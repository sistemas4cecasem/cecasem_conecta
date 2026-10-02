export { createOpaqueToken as createSessionToken, hashOpaqueToken as hashSessionToken } from './opaque-token';

export function sessionIsValid(session: { revokedAt: Date | null; expiresAt: Date }, now = new Date()): boolean {
  return session.revokedAt === null && session.expiresAt.getTime() > now.getTime();
}
