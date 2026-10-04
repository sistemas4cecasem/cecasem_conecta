import { PrismaService } from '../../database/prisma.service';
import { Prisma, UserRole } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import type { UserCredentials } from '../users/user-projections';
import { DirectoryTargetService } from '../directory/directory-target.service';
import { ContactRestrictionsService } from './contact-restrictions.service';
describe('Check transaccional y autorización de restricciones', () => {
  const findFirst = jest.fn(), lock = jest.fn(), create = jest.fn(), updateMany = jest.fn();
  const tx = { $queryRaw: lock, contactRestriction: { findFirst, create, updateMany } } as unknown as Prisma.TransactionClient;
  let actor: UserCredentials;
  const users = { withLockedCredentials: (_id: string, operation: (actor: UserCredentials, tx: Prisma.TransactionClient) => Promise<unknown>) => operation(actor, tx) } as unknown as UsersService;
  const service = new ContactRestrictionsService({} as PrismaService, users, {} as DirectoryTargetService, {} as AuditService);
  beforeEach(() => { jest.resetAllMocks(); actor = { id: 'user', isActive: true, role: UserRole.RESEARCH } as UserCredentials; });
  it('check comparte transacción y canonicaliza UUID en el lock', async () => {
    findFirst.mockResolvedValue(null);
    await service.assertContactAllowed({ organizationId: 'ABCDEF' }, tx);
    expect(lock).toHaveBeenCalledWith(expect.anything(), 'organization:abcdef');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'ABCDEF', state: 'ACTIVE' } }));
  });
  it('activa bloquea acercamiento sin escribir', async () => {
    findFirst.mockResolvedValue({ id: 'restriction' });
    await expect(service.assertContactAllowed({ personId: 'person' }, tx)).rejects.toThrow('CONTACT_RESTRICTED');
    expect(create).not.toHaveBeenCalled(); expect(updateMany).not.toHaveBeenCalled();
  });
  it.each([UserRole.RESEARCH, UserRole.PLANNING])('%s no levanta aunque sea registrador', async role => {
    actor.role = role; await expect(service.lift('restriction', { reason: 'Decisión', expectedVersion: 1 }, actor.id)).rejects.toThrow('FORBIDDEN'); expect(updateMany).not.toHaveBeenCalled();
  });
  it.each(['create', 'lift'])('usuario inactivo no puede %s', async action => {
    actor.isActive = false; actor.role = UserRole.ADMINISTRATOR;
    await expect(action === 'create' ? service.create({ reason: 'Solicitud', organizationId: 'org' }, actor.id) : service.lift('restriction', { reason: 'Decisión', expectedVersion: 1 }, actor.id)).rejects.toThrow('FORBIDDEN');
    expect(create).not.toHaveBeenCalled(); expect(updateMany).not.toHaveBeenCalled();
  });
});
