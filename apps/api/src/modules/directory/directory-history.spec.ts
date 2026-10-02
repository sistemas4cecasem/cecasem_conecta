import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DirectoryHistoryService } from './directory-history.service';
import { changeContract, historicalValue, historyFieldLabel, readHistorySnapshot } from './directory-history.contract';

describe('Contrato y operaciones de historial del directorio', () => {
  const reference = { id: 'category', kind: 'category' as const, label: 'Derechos Humanos' };
  const snapshot = { previous: [], next: [reference], related: [], replacement: null };
  it('representa una relación añadida con su etiqueta histórica, sin resolver el nombre actual', () => {
    const change = changeContract({ field: 'categoryIds', previousValue: [], newValue: ['category'], referenceSnapshot: snapshot });
    expect(change).toMatchObject({ label: 'Categorías', previousReferences: [], newReferences: [reference], added: [reference], removed: [] });
  });
  it('distingue retiradas y conservadas aunque las etiquetas hayan cambiado', () => {
    const other = { id: 'other', kind: 'category' as const, label: 'Educación' };
    const change = changeContract({ field: 'categoryIds', previousValue: ['category', 'other'], newValue: ['other'],
      referenceSnapshot: { ...snapshot, previous: [reference, other], next: [other] } });
    expect(change.removed).toEqual([reference]); expect(change.added).toEqual([]);
  });
  it('una referencia anterior sin snapshot conserva ID y no fabrica una etiqueta', () => {
    expect(changeContract({ field: 'parentId', previousValue: null, newValue: 'organization', referenceSnapshot: null })).toMatchObject({
      previousValue: null, newReferences: [{ id: 'organization', kind: 'organization', label: null }], label: 'Organización matriz' });
  });
  it.each([null, 'Directora', false, ['id']])('conserva el valor tipado %j', value => expect(historicalValue(value)).toEqual(value));
  it('rechaza estructuras privadas o tipos no reconocidos', () => {
    expect(() => historicalValue({ secret: 'fixture' })).toThrow(); expect(() => historyFieldLabel('passwordHash')).toThrow();
  });
  it('un snapshot incompleto no se interpreta como referencia histórica fiable', () => {
    expect(readHistorySnapshot({ previous: [], next: [{ id: 'id', label: 9 }], related: [] })).toBeNull();
  });
  it('agrupa todos los campos de una operación y respeta el orden de operaciones obtenido en PostgreSQL', async () => {
    const actor = { id: 'actor', givenNames: 'Ana', familyNames: 'QA', isActive: false };
    const rows = [
      { operationId: 'older', field: 'country', previousValue: null, newValue: 'Bolivia', referenceSnapshot: null, actor },
      { operationId: 'newer', field: 'country', previousValue: 'Bolivia', newValue: 'Perú', referenceSnapshot: snapshot, actor },
      { operationId: 'newer', field: 'description', previousValue: null, newValue: 'Descripción', referenceSnapshot: snapshot, actor },
    ];
    const queryRaw = jest.fn().mockResolvedValueOnce([{ operationId: 'newer', createdAt: new Date(2) }, { operationId: 'older', createdAt: new Date(1) }])
      .mockResolvedValueOnce([{ total: 2n }]);
    const findMany = jest.fn<Promise<typeof rows>, [{ where: { operationId: { in: string[] } } }]>().mockResolvedValue(rows);
    const tx = { $queryRaw: queryRaw, directoryChange: { findMany } };
    const prisma = { $transaction: (work: (client: typeof tx) => unknown) => work(tx) } as unknown as PrismaService;
    const result = await new DirectoryHistoryService(prisma).list({ organizationId: '00000000-0000-4000-8000-000000000001' }, { page: 1, pageSize: 25 });
    expect(result.total).toBe(2); expect(result.items.map(item => item.operationId)).toEqual(['newer', 'older']);
    expect(result.items[0].changes).toHaveLength(2); expect(result.items[0].actor.isActive).toBe(false);
    expect(findMany.mock.calls[0]?.[0].where.operationId.in).toEqual(['newer', 'older']);
  });
  it('un no-op no consulta referencias ni escribe entradas', async () => {
    const createMany = jest.fn();
    const service = new DirectoryHistoryService({} as PrismaService);
    await service.record({ organizationId: 'organization' }, 'actor', [{ field: 'country', previousValue: 'Bolivia', newValue: 'Bolivia' }],
      { directoryChange: { createMany } } as unknown as Prisma.TransactionClient);
    expect(createMany).not.toHaveBeenCalled();
  });
});
