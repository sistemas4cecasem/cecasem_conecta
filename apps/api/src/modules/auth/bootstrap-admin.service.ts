import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../generated/prisma/client';
import { AppEnvironment } from '../../config/environment';
import { UsersService } from '../users/users.service';
import { normalizeEmail } from '../users/identity-normalization';
import { AdministrationError } from '../users/administration.errors';
import { FirstAccessTokensService } from './first-access-tokens.service';
import { createOpaqueToken, hashOpaqueToken } from './opaque-token';

@Injectable()
export class BootstrapAdminService {
  constructor(private readonly users: UsersService, private readonly tokens: FirstAccessTokensService,
    private readonly config: ConfigService<AppEnvironment, true>) {}

  // Exclusivamente CLI offline. Ningún controller publica este servicio.
  issue(input: { givenNames: string; familyNames: string; email: string }) {
    return this.users.withInitialBootstrap(async (initial, tx) => {
      if (initial && initial.email !== normalizeEmail(input.email)) throw new AdministrationError('BOOTSTRAP_UNAVAILABLE');
      const user = initial ?? await this.users.createIdentity({ ...input, role: UserRole.ADMINISTRATOR }, tx);
      await this.tokens.revokePendingForUser(user.id, tx);
      const token = createOpaqueToken();
      const createdAt = new Date();
      const expiresAt = new Date(+createdAt + this.config.get('FIRST_ACCESS_TOKEN_TTL_SECONDS', { infer: true }) * 1000);
      await tx.firstAccessToken.create({ data: { userId: user.id, createdByUserId: null,
        tokenHash: hashOpaqueToken(token)!, createdAt, expiresAt } });
      return { id: user.id, username: user.username, email: user.email, token, expiresAt, link: `/first-access#token=${token}` };
    });
  }
}
