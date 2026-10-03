import { BadRequestException, Injectable } from '@nestjs/common';
import { DirectorySearchService } from '../directory/directory-search.service';
import { searchInput } from '../directory/directory-search.rules';
import type { SearchQueryDto } from './search.dto';
@Injectable()
export class SearchService {
  constructor(private readonly directory: DirectorySearchService) {}
  async search(query: SearchQueryDto) {
    try { searchInput(query.q); } catch { throw new BadRequestException('Escribe al menos dos caracteres de un nombre o un correo completo válido.'); }
    const [organizations, people, email] = await Promise.all([
      this.directory.searchOrganizations(query), this.directory.searchPeople(query), this.directory.findEmailWithContext(query),
    ]);
    return { query: query.q, organizations, people, email };
  }
}
