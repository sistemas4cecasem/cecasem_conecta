import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { searchInput } from '../directory/directory-search.rules';
import { DirectorySearchService } from '../directory/directory-search.service';
import { SearchService } from './search.service';
import { UsersService } from '../users/users.service';
import { RelationshipSearchService } from '../relationships/relationship-search.service';
import { CommunicationSearchService } from '../communications/communication-search.service';
import { hasPermission } from '../auth/authorization/role-permissions';
jest.mock('../auth/authorization/role-permissions', () => ({ hasPermission: jest.fn(() => true) }));
function fixture() {
  jest.mocked(hasPermission).mockImplementation(() => true);
  const page = { items: [], total: 0, page: 2, pageSize: 5 };
  const directory = { searchOrganizations: jest.fn().mockResolvedValue(page), searchPeople: jest.fn().mockResolvedValue(page), findEmailWithContext: jest.fn().mockResolvedValue(null) };
  const users = { findIdentityById: jest.fn().mockResolvedValue({ id: 'actor', isActive: true, role: 'RESEARCH' }) };
  const relationships = { search: jest.fn().mockResolvedValue(page) };
  const communications = { history: jest.fn().mockResolvedValue({ address: 'old@example.test', ...page, lastValidContact: null }) };
  const service = new SearchService(directory as unknown as DirectorySearchService, users as unknown as UsersService,
    relationships as unknown as RelationshipSearchService, communications as unknown as CommunicationSearchService);
  return { directory, users, relationships, communications, service, page };
}
describe('Consulta pública de búsqueda', () => {
  it.each(['', ' ', 'a', '---', 'a@', 'x'.repeat(255), Array(13).fill('palabra').join(' ')])('rechaza %s antes de consultar persistencia', async q => {
    const f = fixture();
    await expect(f.service.search({ q, page: 1, pageSize: 25, includeInactive: false }, 'actor')).rejects.toBeInstanceOf(BadRequestException);
    expect(f.directory.searchOrganizations).not.toHaveBeenCalled(); expect(f.users.findIdentityById).not.toHaveBeenCalled();
  });
  it.each([['  FUNDACIÓN  Esperanza ', 'fundacion esperanza'], ['María Pérez', 'maria perez'], ['María\u0301', 'maria'], ['F.E.', 'f e']])('normaliza %s sin alterar los textos guardados', (q, name) => {
    expect(searchInput(q).name).toBe(name);
  });
  it('reutiliza correo exacto sin quitar puntos o sufijos', () => {
    expect(searchInput(' MARIA.PEREZ+red@EXAMPLE.TEST ')).toEqual({ q: 'MARIA.PEREZ+red@EXAMPLE.TEST', name: '', email: 'maria.perez+red@example.test' });
  });
  it('orquesta las consultas públicas del directorio y procesos', async () => {
    const organizations = { items: [], total: 0, page: 2, pageSize: 5 }, people = { ...organizations }, email = null;
    const f = fixture(), directory = f.directory;
    const query = { q: 'esperanza', page: 2, pageSize: 5, includeInactive: true };
    expect(await f.service.search(query, 'actor')).toEqual({ query: query.q, organizations, people, email, processes: organizations, emailHistory: null });
    for (const method of Object.values(directory)) expect(method).toHaveBeenCalledWith(query);
    expect(f.relationships.search).toHaveBeenCalledWith({ name: 'esperanza', page: 2, pageSize: 5 }, 'actor');
    expect(f.communications.history).not.toHaveBeenCalled();
  });
  it('consulta correo histórico aunque no haya ContactMethod y preserva la proyección pública', async () => {
    const f = fixture(), history = { ...f.page, total: 1, lastValidContact: { occurredAt: '2026-01-01', registeredBy: 'original', process: 'real' } };
    f.communications.history.mockResolvedValue(history);
    const result = await f.service.search({ q: 'OLD@EXAMPLE.TEST', page: 2, pageSize: 5, includeInactive: false }, 'actor');
    expect(result.email).toBeNull(); expect(result.emailHistory).toEqual(history);
    expect(f.communications.history).toHaveBeenCalledWith({ address: 'old@example.test', page: 2, pageSize: 5 }, 'actor');
  });
  it('correo sin comunicación conserva un historial vacío', async () => {
    const f = fixture(); const result = await f.service.search({ q: 'old@example.test', page: 2, pageSize: 5, includeInactive: false }, 'actor');
    expect(result.emailHistory?.total).toBe(0); expect(result.emailHistory?.lastValidContact).toBeNull();
  });
  it.each([null, { isActive: false, role: 'RESEARCH' }])('rechaza usuario ausente o inactivo', async actor => {
    const f = fixture(); f.users.findIdentityById.mockResolvedValue(actor);
    await expect(f.service.search({ q: 'esperanza', page: 2, pageSize: 5, includeInactive: false }, 'actor')).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.directory.searchOrganizations).not.toHaveBeenCalled();
  });
  it.each([{ permissions: ['directory.read'] }, { permissions: ['directory.read', 'relationships.process.read'] }])('consulta solo grupos permitidos por %j', async ({ permissions }) => {
    const f = fixture(); jest.mocked(hasPermission).mockImplementation((_role, permission) => permissions.includes(permission));
    const result = await f.service.search({ q: 'old@example.test', page: 2, pageSize: 5, includeInactive: false }, 'actor');
    expect(result.processes).toEqual(permissions.includes('relationships.process.read') ? f.page : null);
    expect(result.emailHistory).toBeNull(); expect(f.communications.history).not.toHaveBeenCalled();
    if (!permissions.includes('relationships.process.read')) expect(f.relationships.search).not.toHaveBeenCalled();
  });
});
