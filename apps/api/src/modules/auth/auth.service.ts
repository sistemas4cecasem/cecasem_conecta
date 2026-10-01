import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { PasswordService } from './password.service';
import { SessionsService } from './sessions.service';
import { AuthenticatedUserDto, publicIdentity } from './auth.dto';

export class InvalidCredentialsError extends Error {
  constructor() { super('Credenciales no válidas.'); }
}

@Injectable()
export class AuthService {
  constructor(private readonly users: UsersService, private readonly passwords: PasswordService,
    private readonly sessions: SessionsService) {}

  async login(email: string, password: string, previousToken?: string): Promise<{ user: AuthenticatedUserDto; token: string }> {
    const credentials = await this.users.findCredentialsByEmail(email);
    const valid = await this.passwords.verify(password, credentials?.passwordHash ?? null);
    if (!credentials || !valid || !credentials.passwordHash || !credentials.isActive) throw new InvalidCredentialsError();

    const previousHash = credentials.passwordHash;
    // El cálculo costoso termina antes de adquirir el lock de la identidad.
    const replacement = this.passwords.needsRehash(previousHash) ? await this.passwords.hashForRehash(password) : null;
    return this.users.withLockedCredentials(credentials.id, async (current, tx) => {
      if (!current?.isActive || current.passwordHash !== previousHash) throw new InvalidCredentialsError();
      if (replacement && !await this.users.replaceCredentialIfUnchanged(current.id, previousHash, replacement, tx)) {
        throw new InvalidCredentialsError();
      }
      await this.sessions.revoke(previousToken, tx);
      const token = await this.sessions.create(current.id, tx);
      return { token, user: publicIdentity(current) };
    });
  }
}
