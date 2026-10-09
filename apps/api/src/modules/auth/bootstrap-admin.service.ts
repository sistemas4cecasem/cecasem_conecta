import { Injectable } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { normalizeEmail } from '../users/identity-normalization';
import { AdministrationError } from '../users/administration.errors';
import { FirstAccessTokensService } from './first-access-tokens.service';
import { PasswordService } from './password.service';

@Injectable()
export class BootstrapAdminService {
  constructor(private readonly users: UsersService, private readonly tokens: FirstAccessTokensService,
    private readonly passwords: PasswordService) {}

  // Exclusivamente CLI offline. Ningún controller publica este servicio.
  async initialize(input: { givenNames: string; familyNames: string; email: string }, password: string) {
    const passwordHash = await this.passwords.hashNew(password);
    return this.users.withInitialBootstrap(async (initial, tx) => {
      if (initial && initial.email !== normalizeEmail(input.email)) throw new AdministrationError('BOOTSTRAP_UNAVAILABLE');
      const user = initial ? initial : await this.users.createIdentity({ ...input, role: UserRole.ADMINISTRATOR,
        passwordHash, mustChangePassword: true }, tx);
      if (initial) await this.users.assignAdministrativePasswordLocked(initial.id, passwordHash, tx);
      await this.tokens.revokePendingForUser(user.id, tx);
      return { id: user.id, username: user.username, email: user.email };
    });
  }
}
