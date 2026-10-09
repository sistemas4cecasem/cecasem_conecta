import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { PasswordService, InvalidNewPasswordError, validNewPassword } from './password.service';
import { SessionsService } from './sessions.service';
import { ReusedPasswordError } from './password-reset.errors';

export class RequiredPasswordChangeUnavailableError extends Error {
  constructor() { super('El cambio obligatorio de contraseña ya no está disponible.'); }
}

@Injectable()
export class RequiredPasswordChangeService {
  constructor(private readonly users: UsersService, private readonly passwords: PasswordService,
    private readonly sessions: SessionsService) {}

  async change(userId: string, password: string): Promise<string> {
    if (!validNewPassword(password)) throw new InvalidNewPasswordError();
    const current = await this.users.findCredentialsById(userId);
    if (!current?.isActive || !current.passwordHash || !current.mustChangePassword) throw new RequiredPasswordChangeUnavailableError();
    if (await this.passwords.verify(password, current.passwordHash)) throw new ReusedPasswordError();
    const replacement = await this.passwords.hashNew(password);
    return this.users.withLockedCredentials(userId, async (user, tx) => {
      if (!user?.isActive || !user.passwordHash || !user.mustChangePassword || user.passwordHash !== current.passwordHash) {
        throw new RequiredPasswordChangeUnavailableError();
      }
      if (!await this.users.replaceRequiredPassword(userId, current.passwordHash, replacement, tx)) {
        throw new RequiredPasswordChangeUnavailableError();
      }
      await this.sessions.revokeAllForUser(userId, tx);
      return this.sessions.create(userId, tx);
    });
  }
}
