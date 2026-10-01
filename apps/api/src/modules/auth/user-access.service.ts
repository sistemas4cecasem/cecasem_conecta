import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SessionsService } from './sessions.service';

@Injectable()
export class UserAccessService {
  constructor(private readonly users: UsersService, private readonly sessions: SessionsService) {}

  // Interfaz interna para 1.6: no existe endpoint administrativo.
  async deactivate(userId: string): Promise<void> {
    await this.users.withLockedCredentials(userId, async (user, tx) => {
      if (!user) return;
      await this.users.deactivateLocked(userId, tx);
      await this.sessions.revokeAllForUser(userId, tx);
    });
  }
}
