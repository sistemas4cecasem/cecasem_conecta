import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS } from '../auth/authorization/permission';
import { organizationCommunicationExists } from '../communications/communication-filter.projection';

export interface OrganizationFilters {
  country?: string;
  status?: 'active' | 'inactive' | 'all';
  withCommunications?: boolean;
}
@Injectable()
export class OrganizationFilterService {
  constructor(private readonly users: UsersService) {}
  async predicate(filters: OrganizationFilters, tx: Prisma.TransactionClient, actorId?: string): Promise<Prisma.Sql> {
    const conditions: Prisma.Sql[] = [];
    if (filters.withCommunications !== undefined) {
      const actor = actorId ? await this.users.findIdentityById(actorId, tx) : null;
      if (!actor?.isActive || ![PERMISSIONS.DIRECTORY_READ, PERMISSIONS.PROCESS_READ, PERMISSIONS.COMMUNICATION_READ].every(permission => hasPermission(actor.role, permission))) throw new ForbiddenException();
      const exists = organizationCommunicationExists(Prisma.sql`o.id`);
      conditions.push(filters.withCommunications ? exists : Prisma.sql`NOT (${exists})`);
    }
    if (filters.country !== undefined) conditions.push(Prisma.sql`lower(o.country) = lower(${filters.country})`);
    if (filters.status && filters.status !== 'all') conditions.push(Prisma.sql`o."isActive" = ${filters.status === 'active'}`);
    return conditions.length ? Prisma.join(conditions, ' AND ') : Prisma.sql`TRUE`;
  }
}
