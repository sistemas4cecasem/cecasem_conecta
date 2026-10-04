import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, UserRole } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import type { UserCredentials } from '../users/user-projections';
import { RelationshipProcessesService } from '../relationships/relationship-processes.service';
import { ProcessParticipationService } from '../relationships/process-participation.service';
import { ContactRestrictionsService } from '../relationships/contact-restrictions.service';
import { CommunicationsService } from './communications.service';
import { requestFingerprint, receivedRequestFingerprint } from './communication.rules';
describe('Coordinación del registro enviado', () => {
  const processId = randomUUID(), accountId = randomUUID(), userId = randomUUID(), key = randomUUID();
  const input = { emailAccountId: accountId, to: ['Persona@Example.test'], cc: [], bcc: [], subject: '  Original ', body: 'Texto\n\nFirma', sentAt: '2000-01-01T00:00:00Z' };
  const findUnique = jest.fn(), findUniqueOrThrow = jest.fn(), create = jest.fn(), raw = jest.fn(), mailbox = jest.fn(), lockProcess = jest.fn(), restriction = jest.fn(), participant = jest.fn(), activity = jest.fn(), audit = jest.fn(), receivedAudit = jest.fn(), matchingAccounts = jest.fn();
  const tx = { communication: { findUnique, findUniqueOrThrow, create }, $queryRaw: raw } as unknown as Prisma.TransactionClient;
  let actor: UserCredentials;
  const users = { withLockedCredentials: (_id: string, operation: (actor: UserCredentials, tx: Prisma.TransactionClient) => Promise<unknown>) => operation(actor, tx), lockCommunicationAccount: mailbox, matchingCommunicationAccounts: matchingAccounts } as unknown as UsersService;
  const service = new CommunicationsService({} as PrismaService, users, { lockForCommunication: lockProcess, recordCommunicationActivity: activity } as unknown as RelationshipProcessesService,
    { ensureParticipant: participant } as unknown as ProcessParticipationService, { assertContactAllowed: restriction } as unknown as ContactRestrictionsService, { recordSentCommunication: audit, recordReceivedCommunication: receivedAudit } as unknown as AuditService);
  const row = { amendments: [], id: randomUUID(), processId, direction: 'SENT', validity: 'VALID', version: 1, emailAccountId: accountId, accountAddressSnapshot: 'real@example.test', accountDisplayNameSnapshot: 'Buzón', senderSnapshot: 'real@example.test', subject: input.subject, bodyOriginal: input.body, sentAt: new Date(input.sentAt), occurredAt: new Date(input.sentAt), receivedAt: null, createdAt: new Date('2026-01-01T00:00:00Z'), registeredBy: { id: userId, givenNames: 'Ana', familyNames: 'QA', isActive: true }, recipients: [] };
  beforeEach(() => {
    jest.resetAllMocks(); actor = { id: userId, isActive: true, role: UserRole.RESEARCH } as UserCredentials;
    findUnique.mockResolvedValue(null); matchingAccounts.mockResolvedValue([]); mailbox.mockResolvedValue({ id: accountId, address: 'real@example.test', displayName: 'Buzón' });
    lockProcess.mockResolvedValue({ id: processId, state: 'PREPARATION', target: { organizationId: accountId } });
    raw.mockResolvedValue([{ address: input.to[0], normalized: 'persona@example.test' }]); create.mockResolvedValue(row);
  });
  it.each([UserRole.ADMINISTRATOR, UserRole.BOARD, UserRole.RESEARCH, UserRole.PLANNING])('%s usa snapshots del buzón y una transacción compartida para efectos formales', async role => {
    actor.role = role; const result = await service.registerSent(processId, input, userId, key);
    expect(result.sender).toBe('real@example.test'); expect(result.subject).toBe(input.subject); expect(result.bodyOriginal).toBe(input.body);
    expect(mailbox).toHaveBeenCalledWith(userId, accountId, tx); expect(lockProcess).toHaveBeenCalledWith(processId, tx); expect(restriction).toHaveBeenCalledWith({ organizationId: accountId }, tx);
    expect(participant).toHaveBeenCalledWith(processId, userId, 'SENT_COMMUNICATION', tx); expect(activity).toHaveBeenCalledWith(processId, expect.any(Date), tx); expect(audit).toHaveBeenCalledWith(row.id, userId, expect.any(String), tx);
  });
  it('usuario inactivo se rechaza antes de consultar buzón o proceso', async () => { actor.isActive = false; await expect(service.registerSent(processId, input, userId, key)).rejects.toThrow('FORBIDDEN'); expect(mailbox).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); });
  it('asignación ausente se rechaza sin acción formal', async () => { mailbox.mockResolvedValue(null); await expect(service.registerSent(processId, input, userId, key)).rejects.toThrow('MAILBOX_UNAVAILABLE'); expect(lockProcess).not.toHaveBeenCalled(); expect(participant).not.toHaveBeenCalled(); });
  it('proceso cerrado no se reabre ni registra', async () => { lockProcess.mockResolvedValue({ state: 'CLOSED' }); await expect(service.registerSent(processId, input, userId, key)).rejects.toThrow('PROCESS_CLOSED'); expect(restriction).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); });
  it('restricción bloquea antes de persistir comunicación y participante', async () => { restriction.mockRejectedValue(new Error('CONTACT_RESTRICTED')); await expect(service.registerSent(processId, input, userId, key)).rejects.toThrow('CONTACT_RESTRICTED'); expect(create).not.toHaveBeenCalled(); expect(participant).not.toHaveBeenCalled(); expect(activity).not.toHaveBeenCalled(); expect(audit).not.toHaveBeenCalled(); });
  it('replay de original confirmado no repite efectos', async () => { findUnique.mockResolvedValue({ id: row.id, requestFingerprint: requestFingerprint(processId, input) }); findUniqueOrThrow.mockResolvedValue(row); expect((await service.registerSent(processId, input, userId, key)).id).toBe(row.id); expect(mailbox).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); expect(participant).not.toHaveBeenCalled(); expect(audit).not.toHaveBeenCalled(); });
  const receivedInput = { sender: 'externo@example.test', to: input.to, cc: [], bcc: [], subject: input.subject, body: input.body, receivedAt: input.sentAt };
  const receivedRow = { ...row, direction: 'RECEIVED', senderSnapshot: receivedInput.sender, sentAt: null, receivedAt: row.sentAt, emailAccountId: null, accountAddressSnapshot: null, accountDisplayNameSnapshot: null };
  it.each(['PREPARATION', 'CLOSED'])('recibida en %s no exige buzón ni verifica bloqueo saliente y usa participación recibida', async state => {
    lockProcess.mockResolvedValue({ state }); create.mockResolvedValue(receivedRow); const result = await service.registerReceived(processId, receivedInput, userId, key);
    expect(result.direction).toBe('RECEIVED'); expect(result.sender).toBe(receivedInput.sender); expect(result.emailAccount).toBeNull(); expect(result.receivedAt).toBe(receivedInput.receivedAt.replace('Z', '.000Z'));
    expect(mailbox).not.toHaveBeenCalled(); expect(restriction).not.toHaveBeenCalled(); expect(participant).toHaveBeenCalledWith(processId, userId, 'RECEIVED_COMMUNICATION', tx); expect(activity).toHaveBeenCalledWith(processId, expect.any(Date), tx); expect(receivedAudit).toHaveBeenCalledWith(row.id, processId, userId, expect.any(String), tx);
  });
  it('recibida de usuario inactivo no persiste', async () => { actor.isActive = false; await expect(service.registerReceived(processId, receivedInput, userId, key)).rejects.toThrow('FORBIDDEN'); expect(create).not.toHaveBeenCalled(); });
  it('replay recibido recupera original sin participación/actividad duplicadas', async () => { findUnique.mockResolvedValue({ id: row.id, requestFingerprint: receivedRequestFingerprint(processId, receivedInput) }); findUniqueOrThrow.mockResolvedValue(receivedRow); expect((await service.registerReceived(processId, receivedInput, userId, key)).sender).toBe(receivedInput.sender); expect(lockProcess).not.toHaveBeenCalled(); expect(participant).not.toHaveBeenCalled(); expect(activity).not.toHaveBeenCalled(); });
});
