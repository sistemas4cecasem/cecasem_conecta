import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { RelationshipSearchService } from '../relationships/relationship-search.service';
import { CommunicationSearchService } from './communication-search.service';

describe('Antecedentes públicos de correo', () => {
  const query = { address: 'OLD+Red@Example.test', page: 2, pageSize: 5 };
  const process = { type: 'PROCESS', id: 'process', purpose: 'Objetivo', state: 'CLOSED', target: { kind: 'PERSON', id: 'person', label: 'Persona', isActive: true } };
  const valid = { id: 'valid', processId: 'process', direction: 'SENT', validity: 'VALID', occurredAt: new Date('2025-01-01T12:00:00.000Z'),
    senderSnapshot: 'cecasem@example.test', senderNormalizedAddress: 'cecasem@example.test', recipients: [{ addressOriginal: 'OLD+Red@Example.test' }],
    registeredBy: { id: 'original', givenNames: 'Usuario', familyNames: 'Original', isActive: false } };
  function fixture() {
    const tx = { communication: { findMany: jest.fn().mockResolvedValue([{ ...valid, id: 'invalid', validity: 'INVALIDATED' }]), count: jest.fn().mockResolvedValue(2), findFirst: jest.fn().mockResolvedValue(valid) },
      importedHistoricalRecord: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
    const prisma = { $transaction: jest.fn((callback: (tx: unknown) => unknown) => Promise.resolve(callback(tx))) };
    const users = { findIdentityById: jest.fn().mockResolvedValue({ isActive: true, role: 'RESEARCH' }) };
    const relationships = { contexts: jest.fn().mockResolvedValue(new Map([['process', process]])) };
    return { tx, users, relationships, service: new CommunicationSearchService(prisma as unknown as PrismaService, users as unknown as UsersService, relationships as unknown as RelationshipSearchService) };
  }
  it('consulta snapshots y pide último VALID por fecha real/ID, independientemente de página', async () => {
    const f = fixture(), history = await f.service.history(query, 'actor');
    expect(f.tx.communication.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ senderNormalizedAddress: 'old+red@example.test' }, { recipients: { some: { normalizedAddress: 'old+red@example.test' } } }] }, skip: 5, take: 5 }));
    expect(f.tx.communication.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ senderNormalizedAddress: 'old+red@example.test' }, { recipients: { some: { normalizedAddress: 'old+red@example.test' } } }], validity: 'VALID' }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }] }));
    expect(history.items[0].validity).toBe('INVALIDATED'); expect(history.lastValidContact).toMatchObject({ id: 'valid', occurredAt: valid.occurredAt.toISOString(), matchedAddress: query.address, registeredBy: { id: 'original', displayName: 'Usuario Original' }, process });
    expect(history.importedRecords).toMatchObject({ items: [], total: 0, page: 2, pageSize: 5 });
    expect(f.tx.importedHistoricalRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'old+red@example.test' }, skip: 5, take: 5 }));
    expect(f.relationships.contexts).toHaveBeenCalledTimes(1);
  });
  it('ausencia o solo invalidados no inventa último contacto válido', async () => {
    const f = fixture(); f.tx.communication.findFirst.mockResolvedValue(null);
    expect((await f.service.history(query, 'actor')).lastValidContact).toBeNull();
    f.tx.communication.findMany.mockResolvedValue([]); f.tx.communication.count.mockResolvedValue(0);
    expect(await f.service.history(query, 'actor')).toMatchObject({ items: [], total: 0, lastValidContact: null });
  });
  it('preserva el remitente original sin requerir una asociación actual', async () => {
    const f = fixture(); f.tx.communication.findFirst.mockResolvedValue({ ...valid, senderSnapshot: query.address, senderNormalizedAddress: 'old+red@example.test', recipients: [] });
    expect((await f.service.history(query, 'actor')).lastValidContact?.matchedAddress).toBe(query.address);
  });
  it('mantiene los antecedentes del Excel separados y conserva vacíos los campos no conocidos', async () => {
    const f = fixture(); f.tx.importedHistoricalRecord.findMany.mockResolvedValue([{ id: 'imported', kind: 'SENT', occurredOn: null, email: query.address,
      subject: null, body: null, originalObservation: 'Se indicó un envío', lastVerifiedAt: null,
      batch: { id: 'batch', originalFilename: 'historial.xlsx', createdAt: new Date('2026-10-05T10:00:00Z') }, organization: null, person: null }]);
    f.tx.importedHistoricalRecord.count.mockResolvedValue(1);
    const history = await f.service.history({ ...query, page: 1 }, 'actor');
    expect(history.importedRecords.items[0]).toMatchObject({ type: 'IMPORTED_HISTORICAL_RECORD', id: 'imported', kind: 'SENT', occurredOn: null,
      subject: null, body: null, originalObservation: 'Se indicó un envío', lastVerifiedAt: null, batch: { id: 'batch', originalFilename: 'historial.xlsx' } });
    expect(history.items).toHaveLength(1); expect(history.importedRecords.total).toBe(1);
  });
  it.each([null, { isActive: false, role: 'RESEARCH' }, { isActive: true, role: 'UNKNOWN' }])('revalida acceso antes de datos históricos %j', async actor => {
    const f = fixture(); f.users.findIdentityById.mockResolvedValue(actor);
    await expect(f.service.history(query, 'actor')).rejects.toBeInstanceOf(ForbiddenException); expect(f.tx.communication.findMany).not.toHaveBeenCalled(); expect(f.tx.importedHistoricalRecord.findMany).not.toHaveBeenCalled();
  });
});
