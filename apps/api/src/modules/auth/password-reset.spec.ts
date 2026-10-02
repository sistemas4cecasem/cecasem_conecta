import { validateSync } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { AppEnvironment } from '../../config/environment';
import { AuditAction, Prisma, UserRole } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { ConsumePasswordResetDto, IssuePasswordResetDto } from './password-reset.dto';
import { PasswordResetEmissionError } from './password-reset.errors';
import { PasswordResetService } from './password-reset.service';
import { PasswordResetTokensService, passwordResetIsValid } from './password-reset-tokens.service';
import { PasswordService } from './password.service';
import { SessionsService } from './sessions.service';
import { createOpaqueToken } from './opaque-token';

describe('Password reset rules', () => {
  it.each([UserRole.BOARD, UserRole.RESEARCH, UserRole.PLANNING])('rejects issuance by %s before persistence', async (role) => {
    const locked = jest.fn();
    const service = new PasswordResetService({ withLockedCredentials: locked } as unknown as UsersService,
      {} as PasswordResetTokensService, {} as PasswordService, {} as SessionsService, {} as AuditService, {} as ConfigService<AppEnvironment, true>);
    await expect(service.issue('fixture', { id: 'actor', givenNames: 'Ana', familyNames: 'Prueba', username: 'ana', email: 'fixture@example.test', role }))
      .rejects.toBeInstanceOf(PasswordResetEmissionError);
    expect(locked).not.toHaveBeenCalled();
  });
  it.each(['expired', 'boundary', 'used', 'revoked'])('rejects credential %s', (state) => {
    const now = new Date();
    expect(passwordResetIsValid({ expiresAt: new Date(+now + (state === 'expired' ? -1 : state === 'boundary' ? 0 : 1)),
      usedAt: state === 'used' ? now : null, revokedAt: state === 'revoked' ? now : null }, now)).toBe(false);
  });
  it('accepts an unused unexpired credential', () => {
    const now = new Date(); expect(passwordResetIsValid({ expiresAt: new Date(+now + 1), usedAt: null, revokedAt: null }, now)).toBe(true);
  });
  it.each(['😀'.repeat(15), 'e\u0301'.repeat(15), ' '.repeat(15), 'a'.repeat(128)])('shares normalized password policy', (password) => {
    expect(validateSync(Object.assign(new ConsumePasswordResetDto(), { token: createOpaqueToken(), password }))).toHaveLength(0);
  });
  it.each(['a'.repeat(14), '😀'.repeat(129), null])('rejects invalid password %s', (password) => {
    expect(validateSync(Object.assign(new ConsumePasswordResetDto(), { token: createOpaqueToken(), password })).some(error => error.property === 'password')).toBe(true);
  });
  it('requires a recipient UUID', () => {
    expect(validateSync(Object.assign(new IssuePasswordResetDto(), { userId: 'bad' }))).toHaveLength(1);
  });
  it('persists audit facts in the supplied transaction without secrets or invented actor', async () => {
    const create = jest.fn().mockResolvedValue({}); const now = new Date();
    await new AuditService().recordPasswordReset(AuditAction.PASSWORD_RESET_COMPLETED, null, 'target', 'reset',
      { auditEvent: { create } } as unknown as Prisma.TransactionClient, now);
    expect(create).toHaveBeenCalledWith({ data: { action: 'PASSWORD_RESET_COMPLETED', actorUserId: null, targetUserId: 'target', passwordResetTokenId: 'reset', createdAt: now } });
  });
});
