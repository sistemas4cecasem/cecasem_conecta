import { createHash } from 'node:crypto';
import { createSessionToken, hashSessionToken, sessionIsValid } from './session-token';
import { readSessionToken, SESSION_COOKIE_NAME, sessionCookieOptions } from './session-cookie';

describe('Session tokens, expiry and cookies', () => {
  it('creates independent canonical 32-byte tokens and SHA-256 digests', () => {
    const token = createSessionToken();
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(createSessionToken()).not.toBe(token);
    expect(hashSessionToken(token)).toBe(createHash('sha256').update(token).digest('hex'));
  });
  it.each(['', 'short', 'a'.repeat(44), '+'.repeat(43), 'a'.repeat(43)])('rejects invalid/noncanonical token %s', (token) => {
    expect(hashSessionToken(token)).toBeNull();
  });
  it('rejects expiration at the exact limit and any revoked session', () => {
    const now = new Date();
    expect(sessionIsValid({ expiresAt: now, revokedAt: null }, now)).toBe(false);
    expect(sessionIsValid({ expiresAt: new Date(+now + 1), revokedAt: null }, now)).toBe(true);
    expect(sessionIsValid({ expiresAt: new Date(+now + 1), revokedAt: now }, now)).toBe(false);
  });
  it.each([false, true])('keeps matching issue/clear cookie scope with secure=%s', (secure) => {
    expect(sessionCookieOptions(secure)).toEqual({ httpOnly: true, sameSite: 'lax', secure, path: '/api/v1' });
    expect(sessionCookieOptions(secure)).not.toHaveProperty('domain');
    expect(sessionCookieOptions(secure)).not.toHaveProperty('maxAge');
  });
  it('reads only the named cookie through the declared parser', () => {
    const token = createSessionToken();
    expect(readSessionToken({ headers: { cookie: `other=value; ${SESSION_COOKIE_NAME}=${token}` } })).toBe(token);
    expect(readSessionToken({ headers: {} })).toBeUndefined();
  });
});
