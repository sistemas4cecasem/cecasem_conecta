import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DirectorySearchService } from '../directory/directory-search.service';
import { searchInput } from '../directory/directory-search.rules';
import type { SearchQueryDto } from './search.dto';
import { UsersService } from '../users/users.service';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS } from '../auth/authorization/permission';
import { RelationshipSearchService } from '../relationships/relationship-search.service';
import { CommunicationSearchService } from '../communications/communication-search.service';
import type { SearchResponseDto } from './search-response.dto';
@Injectable()
export class SearchService {
  constructor(private readonly directory: DirectorySearchService, private readonly users: UsersService,
    private readonly relationships: RelationshipSearchService, private readonly communications: CommunicationSearchService) {}
  async search(query: SearchQueryDto, actorId: string): Promise<SearchResponseDto> {
    try { searchInput(query.q); } catch { throw new BadRequestException('Escribe al menos dos caracteres de un nombre o un correo completo válido.'); }
    const input = searchInput(query.q);
    const actor = await this.users.findIdentityById(actorId);
    if (!actor?.isActive || !hasPermission(actor.role, PERMISSIONS.DIRECTORY_READ)) throw new ForbiddenException();
    const processAllowed = hasPermission(actor.role, PERMISSIONS.PROCESS_READ);
    const historyAllowed = processAllowed && hasPermission(actor.role, PERMISSIONS.COMMUNICATION_READ);
    if (query.organizationWithCommunications !== undefined && !historyAllowed) throw new ForbiddenException();
    const organizationFilters = { country: query.organizationCountry, categoryId: query.organizationCategoryId,
      status: query.organizationStatus, verificationStatus: query.organizationVerificationStatus, withCommunications: query.organizationWithCommunications };
    const organizationQuery = Object.values(organizationFilters).some(value => value !== undefined) ? { ...query, organizationFilters, actorId } : query;
    const [organizations, people, email, processes, emailHistory] = await Promise.all([
      this.directory.searchOrganizations(organizationQuery), this.directory.searchPeople(query), this.directory.findEmailWithContext(query),
      processAllowed ? this.relationships.search({ name: input.name, page: query.page, pageSize: query.pageSize }, actorId) : null,
      input.email && historyAllowed ? this.communications.history({ address: input.email, page: query.page, pageSize: query.pageSize }, actorId) : null,
    ]);
    return { query: query.q, organizations, people, email, processes, emailHistory };
  }
}
