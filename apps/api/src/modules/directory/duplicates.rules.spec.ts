import { randomUUID } from 'node:crypto';
import { canonicalPair, comparisonText, identityFingerprint, requireUnconsolidated, similarity, trigramScore, type SimilarityActor } from './duplicates.rules';

const actor = (fields: Partial<SimilarityActor>): SimilarityActor => ({ id: randomUUID(), version: 1, duplicateOfId: null, ...fields });
describe('Similitud calibrada como advertencia, no identidad', () => {
  it.each([
    ['  Fundación   ESPERANZA ', 'fundacion esperanza'], ['María F. Pérez', 'maria f perez'],
    ['Fundación X — Oficina Bolivia', 'fundacion x oficina bolivia'], ['Asociación de ONG', 'asociacion de ong'],
  ])('normaliza %s sin destruir palabras institucionales', (input, expected) => expect(comparisonText(input)).toBe(expected));
  it.each([
    ['Fundación Esperanza', 'Fundacion Esperanza', true], ['Fundación Esperanza', 'Fundación Esperanza Bolivia', true],
    ['Fundación Esperanza', 'Fundación Esperanza — Oficina Bolivia', true], ['Fundación Esperanza', 'Fundación Esparanza', true],
    ['Universidad de La Paz', 'Cooperativa Agrícola del Norte', false], ['Fundación Esperanza', 'Fundación Desarrollo', false],
    ['Banco Unión', 'Banco Mundial', false], ['ONG Futuro', 'Instituto Técnico Central', false],
  ])('fixture institucional %s / %s => candidato=%s', (name, other, expected) => {
    expect(similarity('organization', actor({ name }), actor({ name: other })).matches).toBe(expected);
  });
  it.each([
    ['María Fernanda Pérez', 'Maria F. Perez', true], ['María Pérez', 'Maria Perez', true],
    ['Ana Rodríguez', 'Carlos Gutiérrez', false], ['María Fernanda Pérez', 'Maria Gabriela Gomez', false],
    ['Juan Perez', 'Juan Torres', false],
  ])('fixture personal %s / %s => candidato=%s', (displayName, other, expected) => {
    expect(similarity('person', actor({ displayName }), actor({ displayName: other })).matches).toBe(expected);
  });
  it('la sigla/nombre alternativo aporta señal conservando el nombre', () => {
    const result = similarity('organization', actor({ name: 'Centro de Educación', alias: 'CECASEM' }), actor({ name: 'CECASEM' }));
    expect(result.score).toBe(1); expect(result.matches).toBe(true);
  });
  it('considera los nombres y apellidos separados de una persona', () => {
    expect(similarity('person', actor({ displayName: 'M. Pérez', givenNames: 'María Fernanda', familyNames: 'Pérez' }),
      actor({ displayName: 'Maria Fernanda Perez' })).score).toBe(1);
  });
  it('país diferente y matriz añaden contexto sin provocar falso negativo', () => {
    const result = similarity('organization', actor({ name: 'Fundación Esperanza', country: 'Bolivia' }),
      actor({ name: 'Fundacion Esperanza', country: 'Perú', parentId: randomUUID() }));
    expect(result.matches).toBe(true); expect(result.signals).toEqual(expect.arrayContaining(['DIFFERENT_COUNTRIES', 'REVIEW_PARENT_OFFICE_CONTEXT']));
  });
  it('puntuación simétrica y vacíos sin coincidencia', () => {
    expect(trigramScore('Fundación Esperanza', 'Esperanza Bolivia')).toBe(trigramScore('Esperanza Bolivia', 'Fundación Esperanza'));
    expect(trigramScore('', '')).toBe(0);
  });
  it('pareja estable independientemente del sentido', () => {
    const a = actor({}), b = actor({}); expect(canonicalPair(a, b)).toEqual(canonicalPair(b, a));
    expect(canonicalPair(a, b)[0].id < canonicalPair(a, b)[1].id).toBe(true);
  });
  it('rechaza el mismo actor', () => { const a = actor({}); expect(() => canonicalPair(a, a)).toThrow('INVALID_CONSOLIDATION_TARGET'); });
  it('la huella no cambia por estado, verificación o versión técnica', () => {
    const a = actor({ name: 'Fundación Esperanza' });
    expect(identityFingerprint('organization', a)).toBe(identityFingerprint('organization', { ...a, version: 8 }));
  });
  it('cambia la huella cuando cambia información relevante', () => {
    const a = actor({ name: 'Fundación Esperanza' });
    expect(identityFingerprint('organization', a)).not.toBe(identityFingerprint('organization', { ...a, alias: 'FE' }));
  });
  it('no infiere identidad por compartir un contacto', () => {
    expect(similarity('person', actor({ displayName: 'Ana Perez' }), actor({ displayName: 'Luis Torres' })).matches).toBe(false);
  });
  it.each(['organization', 'person'] as const)('rechaza escrituras del %s consolidado con ruta pública', kind => {
    const principalId = randomUUID();
    try { requireUnconsolidated(actor({ duplicateOfId: principalId }), kind); throw new Error('Debe rechazar'); }
    catch (error) { expect(error).toMatchObject({ code: 'ACTOR_ALREADY_CONSOLIDATED', details: { principalId,
      principalPath: (kind === 'person' ? 'people/' : 'organizations/') + principalId } }); }
  });
});
