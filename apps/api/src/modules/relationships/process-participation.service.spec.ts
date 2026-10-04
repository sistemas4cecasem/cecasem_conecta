import { ParticipantOrigin, Prisma } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { ProcessParticipationService } from './process-participation.service';

describe('Interfaz de participación formal', () => {
  const at = new Date('2026-10-03T12:00:00Z');
  const findIdentityById = jest.fn(), findUnique = jest.fn(), createMany = jest.fn(), findUniqueOrThrow = jest.fn();
  const users = { findIdentityById } as unknown as UsersService;
  const tx = { relationshipProcess: { findUnique }, processParticipant: { createMany, findUniqueOrThrow } } as unknown as Prisma.TransactionClient;
  const service = new ProcessParticipationService(users);
  beforeEach(() => { jest.resetAllMocks(); findIdentityById.mockResolvedValue({ id: 'creator', isActive: true });
    findUnique.mockResolvedValue({ createdByUserId: 'creator', createdAt: at }); createMany.mockResolvedValue({ count: 0 }); });
  it('creador usa fecha del proceso y la transacción del productor', async () => {
    await service.ensureParticipant('process', 'creator', ParticipantOrigin.PROCESS_CREATOR, tx);
    expect(findIdentityById).toHaveBeenCalledWith('creator', tx);
    expect(createMany).toHaveBeenCalledWith({ data: { processId: 'process', userId: 'creator', origin: 'PROCESS_CREATOR', joinedAt: at }, skipDuplicates: true });
  });
  it.each([ParticipantOrigin.SENT_COMMUNICATION, ParticipantOrigin.RECEIVED_COMMUNICATION])('%s devuelve primer registro sin actualizarlo', async origin => {
    const first = { processId: 'process', userId: 'actor', origin: 'SENT_COMMUNICATION', joinedAt: at };
    findUniqueOrThrow.mockResolvedValue(first);
    expect(await service.ensureParticipant('process', 'actor', origin, tx)).toBe(first);
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });
  it('rechaza notas como origen sin escribir', async () => {
    await expect(service.ensureParticipant('process', 'creator', 'INTERNAL_NOTE' as ParticipantOrigin, tx)).rejects.toThrow('INVALID_PROCESS');
    expect(createMany).not.toHaveBeenCalled();
  });
  it('rechaza proceso inexistente', async () => { findUnique.mockResolvedValue(null);
    await expect(service.ensureParticipant('missing', 'creator', ParticipantOrigin.PROCESS_CREATOR, tx)).rejects.toThrow('PROCESS_NOT_FOUND'); });
  it.each([null, { isActive: false }])('rechaza usuario ausente/inactivo %j', async identity => { findIdentityById.mockResolvedValue(identity);
    await expect(service.ensureParticipant('process', 'creator', ParticipantOrigin.PROCESS_CREATOR, tx)).rejects.toThrow('FORBIDDEN'); expect(createMany).not.toHaveBeenCalled(); });
  it('no admite atribuir origen creador a otro usuario', async () => {
    await expect(service.ensureParticipant('process', 'other', ParticipantOrigin.PROCESS_CREATOR, tx)).rejects.toThrow('FORBIDDEN'); expect(createMany).not.toHaveBeenCalled();
  });
});
