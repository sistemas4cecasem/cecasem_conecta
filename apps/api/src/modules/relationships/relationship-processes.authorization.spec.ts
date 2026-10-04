import { PrismaService } from '../../database/prisma.service';
import { Prisma, UserRole } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import type { UserCredentials } from '../users/user-projections';
import { AuditService } from '../audit/audit.service';
import { DirectoryTargetService } from '../directory/directory-target.service';
import { ProcessParticipationService } from './process-participation.service';
import { RelationshipProcessesService } from './relationship-processes.service';
import { ContactRestrictionsService } from './contact-restrictions.service';

describe('Autorización vigente de actuaciones del proceso', () => {
  const updateMany = jest.fn(), isParticipant = jest.fn();
  const tx = { $queryRaw: jest.fn(), relationshipProcess: { findUnique: jest.fn(), updateMany } } as unknown as Prisma.TransactionClient;
  let current: UserCredentials;
  const users = { withLockedCredentials: (_id: string, operation: (user: UserCredentials, tx: Prisma.TransactionClient) => Promise<unknown>) => operation(current, tx) } as unknown as UsersService;
  const service = new RelationshipProcessesService({} as PrismaService, users, {} as DirectoryTargetService,
    {} as AuditService, { isParticipant } as unknown as ProcessParticipationService, {} as ContactRestrictionsService);
  const actions = {
    state: () => service.changeState('process', { expectedVersion: 1, state: 'IN_PROGRESS' }, 'actor'),
    close: () => service.close('process', { expectedVersion: 1, result: 'ACHIEVED' }, 'actor'),
    reopen: () => service.reopen('process', { expectedVersion: 1, state: 'IN_PROGRESS', reason: 'Respuesta' }, 'actor'),
  };
  beforeEach(() => { jest.resetAllMocks(); current = { id: 'actor', role: UserRole.RESEARCH, isActive: true } as UserCredentials; });
  it.each(Object.keys(actions) as (keyof typeof actions)[])('%s rechaza inactivo aunque siga siendo participante histórico', async action => {
    current.isActive = false; isParticipant.mockResolvedValue(true);
    await expect(actions[action]()).rejects.toThrow('FORBIDDEN'); expect(updateMany).not.toHaveBeenCalled();
  });
  it.each(Object.keys(actions) as (keyof typeof actions)[])('%s usa rol cambiado a Planificación sin mantener excepción anterior', async action => {
    current.role = UserRole.PLANNING;
    (tx.relationshipProcess.findUnique as jest.Mock).mockResolvedValue({ id: 'process' }); isParticipant.mockResolvedValue(false);
    await expect(actions[action]()).rejects.toThrow('FORBIDDEN'); expect(updateMany).not.toHaveBeenCalled();
  });
});
