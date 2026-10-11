import { randomUUID } from 'node:crypto';
import { compareTimeline, decodeTimelineCursor, encodeTimelineCursor, internalNoteBody, timelineSeek, type TimelineSource } from './timeline.rules';
import type { TimelineItem } from './timeline.dto';
const id = randomUUID(), processId = randomUUID(), at = '2026-01-01T00:00:00.000Z';
const item: TimelineItem = { id, kind: 'INTERNAL_NOTE', occurredAt: at, registeredAt: at, summary: 'Nota', actor: { id, displayName: 'Ana', isActive: true }, payload: { noteId: id, body: 'Original' } };
describe('Cronología y cursor del timeline', () => {
  it('cursor vincula dirección y conserva compatibilidad con cursores ascendentes anteriores', () => {
    const descending = encodeTimelineCursor(processId, item, 'desc');
    expect(decodeTimelineCursor(processId, descending, 'desc')?.id).toBe(id);
    expect(() => decodeTimelineCursor(processId, descending)).toThrow('INVALID_TIMELINE_CURSOR');
    expect(() => decodeTimelineCursor(processId, encodeTimelineCursor(processId, item), 'desc')).toThrow('INVALID_TIMELINE_CURSOR');
    const legacy = Buffer.from(JSON.stringify({ processId, id, occurredAt: at, registeredAt: at, source: 'NOTE' })).toString('base64url');
    expect(decodeTimelineCursor(processId, legacy)?.id).toBe(id);
    expect(() => decodeTimelineCursor(processId, legacy, 'desc')).toThrow('INVALID_TIMELINE_CURSOR');
  });
  it.each(['asc', 'desc'] as const)('%s: predicado coincide con la tupla completa para todas las fuentes y empates', order => {
    const sources: TimelineSource[] = ['AMENDMENT', 'COMMUNICATION', 'EVENT', 'FILE', 'MEETING', 'NOTE', 'REFERRAL'];
    const dates = ['2026-01-01', '2026-01-02', '2026-01-03'].map(day => new Date(day + 'T00:00:00.000Z'));
    const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
    type Row = { occurredAt: Date; createdAt: Date; source: TimelineSource; id: string };
    const rows: Row[] = sources.flatMap(source => dates.flatMap(occurredAt =>
      (source === 'COMMUNICATION' ? dates : [occurredAt]).flatMap(createdAt => ids.map(id => ({ source, occurredAt, createdAt, id })))));
    function matches(row: Row, predicate: object): boolean {
      return Object.entries(predicate).every(([key, value]: [string, unknown]) => {
        if (key === 'OR') return (value as object[]).some(condition => matches(row, condition));
        const actual = row[key as 'occurredAt' | 'createdAt' | 'id'];
        if (value instanceof Date) return +actual === +value;
        if (value && typeof value === 'object') return Object.entries(value).every(([comparison, expected]: [string, Date | string]) => comparison === 'gt' ? actual > expected : actual < expected);
        return actual === value;
      });
    }
    for (const cursor of rows) {
      const after = { ...cursor, registeredAt: cursor.createdAt };
      for (const row of rows) {
        const compare = +row.occurredAt - +cursor.occurredAt || +row.createdAt - +cursor.createdAt || row.source.localeCompare(cursor.source) || row.id.localeCompare(cursor.id);
        expect(matches(row, timelineSeek(after, row.source, row.source === 'COMMUNICATION' ? 'occurredAt' : 'createdAt', order))).toBe(order === 'asc' ? compare > 0 : compare < 0);
      }
    }
  });
  it('cursor conserva la posición completa y queda asociado al proceso', () => {
    const value = encodeTimelineCursor(processId, item);
    expect(decodeTimelineCursor(processId, value)).toEqual({ id, source: 'NOTE', occurredAt: new Date(at), registeredAt: new Date(at) });
    expect(() => decodeTimelineCursor(randomUUID(), value)).toThrow('INVALID_TIMELINE_CURSOR');
  });
  it.each(['', 'bad cursor', 'e30', 'x'.repeat(1025), Buffer.from(JSON.stringify({ processId, occurredAt: 'bad' })).toString('base64url')])('cursor malformado se rechaza: %s', value => expect(() => decodeTimelineCursor(processId, value)).toThrow('INVALID_TIMELINE_CURSOR'));
  it('fecha real prevalece sobre la fecha de registro y el orden de entrada', () => {
    const old = { ...item, occurredAt: '2000-01-01T00:00:00.000Z', registeredAt: '2027-01-01T00:00:00.000Z' };
    expect([item, old].sort(compareTimeline)).toEqual([old, item]);
  });
  it('fuente de cursor debe ser un string, no un array que pueda convertirse a string', () => {
    const malformed = Buffer.from(JSON.stringify({ processId, id, occurredAt: at, registeredAt: at, source: ['NOTE'] })).toString('base64url');
    expect(() => decodeTimelineCursor(processId, malformed)).toThrow('INVALID_TIMELINE_CURSOR');
  });
  it('empate se resuelve por registro, fuente e ID', () => {
    const event: TimelineItem = { ...item, kind: 'PROCESS_CREATED', payload: { authority: 'PARTICIPANT', eventId: id, previousState: null, newState: 'PREPARATION', result: null, observation: null } };
    expect([item, event].sort(compareTimeline)).toEqual([event, item]);
    expect(compareTimeline({ ...item, id: '00000000-0000-4000-8000-000000000001' }, { ...item, id: '00000000-0000-4000-8000-000000000002' })).toBeLessThan(0);
  });
  it('evento con registro igual a fecha real no salta hacia la fecha de carga retrospectiva', () => {
    const after = { id, source: 'COMMUNICATION' as const, occurredAt: new Date(at), registeredAt: new Date('2026-02-01T00:00:00.000Z') };
    expect(timelineSeek(after, 'EVENT', 'createdAt')).toEqual({ OR: [{ createdAt: { gt: new Date(at) } }] });
    expect(timelineSeek(undefined, 'NOTE', 'createdAt')).toEqual({});
  });
  it.each([undefined, null, 1, '', '  \n\t', 'x'.repeat(5001), 'texto\0'])('nota inválida no se convierte en actuación: %j', value => expect(() => internalNoteBody(value)).toThrow('INVALID_INTERNAL_NOTE'));
  it('nota conserva el original, incluidos espacios y texto literal', () => expect(internalNoteBody('  <script>literal</script>\nContexto  ')).toBe('  <script>literal</script>\nContexto  '));
});
