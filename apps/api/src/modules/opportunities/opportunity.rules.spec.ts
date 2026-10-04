import { randomUUID } from 'node:crypto';
import { OpportunityStatus } from '../../generated/prisma/client';
import { decodeOpportunityCursor, opportunityDeadline, opportunityDescriptions, opportunityFingerprint, opportunityOrganizations, opportunityOrigin, opportunityText, opportunityVersion, requireOpportunityTransition } from './opportunity.rules';
describe('Reglas de oportunidades', () => {
  const ids = [randomUUID(), randomUUID()], base = { name: ' Beca ', organizationIds: ids };
  const allowed = new Set(['PENDING_REVIEW:PREPARING', 'PENDING_REVIEW:DISCARDED', 'PREPARING:SUBMITTED', 'PREPARING:DISCARDED', 'SUBMITTED:FINISHED']);
  it.each(Object.values(OpportunityStatus).flatMap(from => Object.values(OpportunityStatus).map(to => [from, to])))('%s → %s respeta el ciclo documentado', (from, to) => { if (allowed.has(from + ':' + to))
    expect(() => requireOpportunityTransition(from, to)).not.toThrow();
  else
    expect(() => requireOpportunityTransition(from, to)).toThrow('INVALID_OPPORTUNITY_TRANSITION'); });
  it.each(['2025-02-29', '2026-02-30', '0000-01-01', '2026-12-01T00:00:00Z', '01/12/2026', '2026-13-01'])('rechaza fecha ambigua/inválida %s', date => expect(() => opportunityDeadline(date)).toThrow());
  it('preserva fecha civil incluso vencida y permite quitarla', () => { expect(opportunityDeadline('2000-02-29')).toBe('2000-02-29'); expect(opportunityDeadline(null)).toBeNull(); });
  it.each(['', '   ', '\n\t', null, undefined])('requiere texto significativo para motivo %s', value => expect(() => opportunityText(value, 5000, true)).toThrow());
  it.each([0, -1, 1.5, NaN, '1', 2147483647])('rechaza versión inválida %s', value => expect(() => opportunityVersion(value)).toThrow());
  it('canoniza nombres/organizaciones y conserva campos omitidos al editar', () => { const row = opportunityDescriptions({ ...base, description: ' original ', deadline: '2026-12-31' }); expect(row.name).toBe('Beca'); expect(opportunityDescriptions({ name: ' Corregida ', description: null }, row)).toEqual({ ...row, name: 'Corregida', description: null }); });
  it('no acepta organizaciones vacías, duplicadas ni URL activa/credenciales', () => { for (const value of [[], [ids[0], ids[0]], [ids[0], ids[0].toUpperCase()]])
    expect(() => opportunityOrganizations(value)).toThrow(); for (const url of ['javascript:alert(1)', 'https://user:password@example.test'])
    expect(() => opportunityDescriptions({ ...base, url })).toThrow(); });
  it('la huella canoniza orden y detecta contenidos distintos', () => { const origin = { processId: null, communicationId: null }; const a = opportunityDescriptions(base), b = opportunityDescriptions({ ...base, name: 'Beca', organizationIds: [...ids].reverse() }); expect(opportunityFingerprint(a, origin)).toBe(opportunityFingerprint(b, origin)); expect(opportunityFingerprint({ ...a, name: 'Otra' }, origin)).not.toBe(opportunityFingerprint(a, origin)); });
  it('valida cursor sin aceptar SQL, objetos incompletos ni fechas inválidas', () => { const cursor = { createdAt: '2026-10-04T00:00:00.000Z', source: 'EVENT', id: ids[0] }; expect(decodeOpportunityCursor(Buffer.from(JSON.stringify(cursor)).toString('base64url'))).toEqual({ ...cursor, createdAt: new Date(cursor.createdAt) }); for (const value of ['SELECT *', 'e30', Buffer.from(JSON.stringify({ ...cursor, createdAt: 'x' })).toString('base64url')])
    expect(() => decodeOpportunityCursor(value)).toThrow('INVALID_OPPORTUNITY_CURSOR'); });
  it('valida identificadores de origen sin inventar referencias', () => { expect(opportunityOrigin({})).toEqual({ processId: null, communicationId: null }); expect(opportunityOrigin({ processId: ids[0].toUpperCase() }).processId).toBe(ids[0]); expect(() => opportunityOrigin({ communicationId: 'no-id' })).toThrow('INVALID_OPPORTUNITY_ORIGIN'); });
  it('canoniza el esquema HTTP y rechaza controles en nombres antes de SQL', () => { expect(opportunityDescriptions({ ...base, url: 'HTTP://example.test' }).url).toBe('http://example.test/'); expect(() => opportunityDescriptions({ ...base, url: 'https://example.test/' + 'é'.repeat(800) })).toThrow('INVALID_OPPORTUNITY'); expect(() => opportunityDescriptions({ ...base, name: 'Nombre\tinválido' })).toThrow('INVALID_OPPORTUNITY'); });
});
