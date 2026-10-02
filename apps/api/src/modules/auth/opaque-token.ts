import { createHash, randomBytes } from 'node:crypto';

export const createOpaqueToken = (): string => randomBytes(32).toString('base64url');
export function hashOpaqueToken(token: unknown): string | null {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    Buffer.from(token, 'base64url').toString('base64url') !== token) return null;
  return createHash('sha256').update(token).digest('hex');
}
