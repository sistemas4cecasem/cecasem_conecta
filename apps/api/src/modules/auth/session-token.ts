import { createHash, randomBytes } from 'node:crypto';

export const createSessionToken = (): string => randomBytes(32).toString('base64url');
export function hashSessionToken(token: string): string | null {
  // También verifica la codificación canónica de los 32 bytes.
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || Buffer.from(token, 'base64url').toString('base64url') !== token) return null;
  return createHash('sha256').update(token).digest('hex');
}

export function sessionIsValid(session: { revokedAt: Date | null; expiresAt: Date }, now = new Date()): boolean {
  return session.revokedAt === null && session.expiresAt.getTime() > now.getTime();
}
