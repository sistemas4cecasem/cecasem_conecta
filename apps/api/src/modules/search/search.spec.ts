import { BadRequestException } from '@nestjs/common';
import { searchInput } from '../directory/directory-search.rules';
import { DirectorySearchService } from '../directory/directory-search.service';
import { SearchService } from './search.service';
describe('Consulta pública de búsqueda', () => {
  it.each(['', ' ', 'a', '---', 'a@', 'x'.repeat(255), Array(13).fill('palabra').join(' ')])('rechaza %s antes de consultar persistencia', async q => {
    const directory = { searchOrganizations: jest.fn(), searchPeople: jest.fn(), findEmailWithContext: jest.fn() };
    await expect(new SearchService(directory as unknown as DirectorySearchService).search({ q, page: 1, pageSize: 25, includeInactive: false })).rejects.toBeInstanceOf(BadRequestException);
    expect(directory.searchOrganizations).not.toHaveBeenCalled(); expect(directory.findEmailWithContext).not.toHaveBeenCalled();
  });
  it.each([['  FUNDACIÓN  Esperanza ', 'fundacion esperanza'], ['María Pérez', 'maria perez'], ['María\u0301', 'maria'], ['F.E.', 'f e']])('normaliza %s sin alterar los textos guardados', (q, name) => {
    expect(searchInput(q).name).toBe(name);
  });
  it('reutiliza correo exacto sin quitar puntos o sufijos', () => {
    expect(searchInput(' MARIA.PEREZ+red@EXAMPLE.TEST ')).toEqual({ q: 'MARIA.PEREZ+red@EXAMPLE.TEST', name: '', email: 'maria.perez+red@example.test' });
  });
  it('orquesta exclusivamente las tres consultas públicas del directorio', async () => {
    const organizations = { items: [], total: 0, page: 2, pageSize: 5 }, people = { ...organizations }, email = null;
    const directory = { searchOrganizations: jest.fn().mockResolvedValue(organizations), searchPeople: jest.fn().mockResolvedValue(people), findEmailWithContext: jest.fn().mockResolvedValue(email) };
    const query = { q: 'esperanza', page: 2, pageSize: 5, includeInactive: true };
    expect(await new SearchService(directory as unknown as DirectorySearchService).search(query)).toEqual({ query: query.q, organizations, people, email });
    for (const method of Object.values(directory)) expect(method).toHaveBeenCalledWith(query);
  });
});
