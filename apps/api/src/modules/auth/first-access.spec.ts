import { validateSync } from 'class-validator';
import { createOpaqueToken, hashOpaqueToken } from './opaque-token';
import { firstAccessIsValid } from './first-access-tokens.service';
import { ConsumeFirstAccessDto, IssueFirstAccessDto } from './first-access.dto';
import { InvalidNewPasswordError, PasswordService, validNewPassword } from './password.service';
import { FirstAccessService } from './first-access.service';
import { FirstAccessEmissionError } from './first-access.errors';
import { UsersService } from '../users/users.service';
import { FirstAccessTokensService } from './first-access-tokens.service';
import { SessionsService } from './sessions.service';
import { ConfigService } from '@nestjs/config';
import { AppEnvironment } from '../../config/environment';
import { UserRole } from '../../generated/prisma/client';

describe('First access credential policy', () => {
  it.each([UserRole.BOARD, UserRole.RESEARCH, UserRole.PLANNING])('rejects issuance by %s before touching persistence', async (role) => {
    const locked = jest.fn();
    const service = new FirstAccessService({ withLockedCredentials: locked } as unknown as UsersService,
      {} as FirstAccessTokensService, {} as PasswordService, {} as SessionsService, {} as ConfigService<AppEnvironment, true>);
    await expect(service.issue('fixture', { id: 'actor', givenNames: 'Ana', familyNames: 'Prueba', username: 'ana', email: 'fixture@example.test', role }))
      .rejects.toBeInstanceOf(FirstAccessEmissionError);
    expect(locked).not.toHaveBeenCalled();
  });
  it('generates canonical independent 256-bit credentials and only a digest for persistence', () => {
    const token = createOpaqueToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(token).toHaveLength(43);
    expect(createOpaqueToken()).not.toBe(token);
    expect(hashOpaqueToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOpaqueToken(token)).not.toBe(token);
  });
  it.each([null, {}, '', 'x'.repeat(42), '+'.repeat(43), 'a'.repeat(43)])('rejects malformed/noncanonical representation %s', (token) => {
    expect(hashOpaqueToken(token)).toBeNull();
  });
  it.each(['expired', 'boundary', 'used', 'revoked', 'both'])('rejects terminal credential %s', (state) => {
    const now = new Date();
    expect(firstAccessIsValid({ expiresAt: new Date(+now + (state === 'expired' ? -1 : state === 'boundary' ? 0 : 1)),
      usedAt: state === 'used' || state === 'both' ? now : null, revokedAt: state === 'revoked' || state === 'both' ? now : null }, now)).toBe(false);
  });
  it('accepts an unused credential before its expiration', () => {
    const now = new Date();
    expect(firstAccessIsValid({ expiresAt: new Date(+now + 1), usedAt: null, revokedAt: null }, now)).toBe(true);
  });
  it.each(['😀'.repeat(15), 'e\u0301'.repeat(15), ' '.repeat(15), 'a'.repeat(128)])('reuses normalized Unicode policy', (password) => {
    expect(validNewPassword(password)).toBe(true);
    expect(validateSync(Object.assign(new ConsumeFirstAccessDto(), { token: createOpaqueToken(), password }))).toHaveLength(0);
  });
  it.each(['a'.repeat(14), '😀'.repeat(129), null])('returns a controlled password-policy error for %s', (password) => {
    expect(validNewPassword(password)).toBe(false);
    expect(validateSync(Object.assign(new ConsumeFirstAccessDto(), { token: createOpaqueToken(), password })).some((error) => error.property === 'password')).toBe(true);
    expect(() => new PasswordService().hashNew(password as string)).toThrow(InvalidNewPasswordError);
  });
  it('requires the administrative recipient UUID', () => {
    expect(validateSync(Object.assign(new IssueFirstAccessDto(), { userId: 'not-a-uuid' }))).toHaveLength(1);
  });
});
