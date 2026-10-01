import { AuthService, InvalidCredentialsError } from './auth.service';
import { PasswordService } from './password.service';
import { SessionsService } from './sessions.service';
import { UsersService } from '../users/users.service';
import { UserCredentials } from '../users/user-projections';
import { UserRole } from '../../generated/prisma/client';
import { publicIdentity } from './auth.dto';

describe('Authentication boundaries', () => {
  const credential: UserCredentials = { id: 'fixture', givenNames: 'Ana', familyNames: 'Prueba', username: 'ana.prueba',
    email: 'fixture@example.test', role: UserRole.RESEARCH, isActive: true, passwordHash: 'internal-hash',
    createdAt: new Date(), updatedAt: new Date(), deactivatedAt: null };

  it.each([null, { ...credential, passwordHash: null }, { ...credential, isActive: false }, credential])(
    'performs verification and returns the same internal rejection for invalid credentials', async (user) => {
      const users = { findCredentialsByEmail: jest.fn().mockResolvedValue(user), withLockedCredentials: jest.fn() };
      const passwords = { verify: jest.fn().mockResolvedValue(false) };
      const sessions = { revoke: jest.fn() };
      const auth = new AuthService(users as unknown as UsersService, passwords as unknown as PasswordService, sessions as unknown as SessionsService);
      await expect(auth.login('fixture@example.test', 'input')).rejects.toBeInstanceOf(InvalidCredentialsError);
      expect(passwords.verify).toHaveBeenCalledWith('input', user?.passwordHash ?? null);
      expect(users.withLockedCredentials).not.toHaveBeenCalled();
      expect(sessions.revoke).not.toHaveBeenCalled();
    });

  it('returns only the allowlisted public identity even when persistence contains credentials', () => {
    expect(Object.keys(publicIdentity(credential)).sort()).toEqual(['email', 'familyNames', 'givenNames', 'id', 'role', 'username']);
  });
});
