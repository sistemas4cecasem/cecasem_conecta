import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { VerificationSettingsService } from '../settings/verification-settings.service';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS } from '../auth/authorization/permission';
import { organizationCommunicationExists } from '../communications/communication-filter.projection';
import { organizationVerificationPredicate, type VerificationStatus } from './verification.rules';
import { VerificationClock } from './verification.service';

export interface OrganizationFilters {
  country?: string;
  categoryId?: string;
  status?: 'active' | 'inactive' | 'all';
  verificationStatus?: VerificationStatus;
  withCommunications?: boolean;
}
@Injectable()
export class OrganizationFilterService {
  constructor(private readonly users: UsersService, private readonly settings: VerificationSettingsService, private readonly clock: VerificationClock) {}
  async predicate(filters: OrganizationFilters, tx: Prisma.TransactionClient, actorId?: string): Promise<Prisma.Sql> {
    const conditions: Prisma.Sql[] = [];
    if (filters.withCommunications !== undefined) {
      const actor = actorId ? await this.users.findIdentityById(actorId, tx) : null;
      if (!actor?.isActive || ![PERMISSIONS.DIRECTORY_READ, PERMISSIONS.PROCESS_READ, PERMISSIONS.COMMUNICATION_READ].every(permission => hasPermission(actor.role, permission))) throw new ForbiddenException();
      const exists = organizationCommunicationExists(Prisma.sql`o.id`);
      conditions.push(filters.withCommunications ? exists : Prisma.sql`NOT (${exists})`);
    }
    if (filters.country !== undefined) conditions.push(Prisma.sql`lower(o.country) = lower(${filters.country})`);
    if (filters.categoryId !== undefined) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "OrganizationCategory" oc WHERE oc."organizationId" = o.id AND oc."categoryId" = ${filters.categoryId}::uuid)`);
    if (filters.status && filters.status !== 'all') conditions.push(Prisma.sql`o."isActive" = ${filters.status === 'active'}`);
    if (filters.verificationStatus) {
      const settings = await this.settings.get(tx);
      conditions.push(organizationVerificationPredicate(filters.verificationStatus, Prisma.sql`o.id`, Prisma.sql`o.version`, settings.institutionalVerificationMonths, this.clock.now()));
    }
    return conditions.length ? Prisma.join(conditions, ' AND ') : Prisma.sql`TRUE`;
  }
}
