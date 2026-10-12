import { OrganizationFilterService } from './organization-filter.service';
import type { UsersService } from '../users/users.service';
import type { Prisma } from '../../generated/prisma/client';

describe('Filtros institucionales: permisos y proyección acotada', () => {
  const identity = jest.fn();
  const tx = {} as Prisma.TransactionClient;
  const service = new OrganizationFilterService({ findIdentityById: identity } as unknown as UsersService);
  beforeEach(() => { jest.clearAllMocks(); identity.mockResolvedValue({ isActive: true, role: 'PLANNING' }); });

  it.each([true, false])('consulta comunicaciones solo tras revalidar al actor (%s)', async withCommunications => {
    const sql = await service.predicate({ withCommunications }, tx, 'actor');
    expect(identity).toHaveBeenCalledWith('actor', tx); expect(sql.text).toContain('"Communication"'); expect(sql.text).not.toContain('InternalNote');
    expect(sql.text.includes('NOT (')).toBe(!withCommunications);
  });
  it.each([null, { isActive: false, role: 'ADMINISTRATOR' }, { isActive: true, role: 'UNKNOWN' }])('rechaza actor sin acceso antes de producir predicado (%j)', async actor => {
    identity.mockResolvedValue(actor); await expect(service.predicate({ withCommunications: true }, tx, 'actor')).rejects.toThrow();
  });
  it('sin identidad no permite filtrar por ausencia ni presencia de comunicaciones', async () => {
    await expect(service.predicate({ withCommunications: false }, tx)).rejects.toThrow(); expect(identity).not.toHaveBeenCalled();
  });
  it('parametriza datos de país y categoría y combina el estado', async () => {
    const country = "Bolivia' OR TRUE --";
    const sql = await service.predicate({ country, categoryId: '11111111-1111-4111-8111-111111111111', status: 'inactive' }, tx);
    expect(sql.values).toContain(country); expect(sql.text).not.toContain(country);
    expect(sql.text).toContain('"OrganizationCategory"'); expect(sql.text).toContain('o."isActive"'); expect(sql.text).toContain(' AND ');
  });
});
