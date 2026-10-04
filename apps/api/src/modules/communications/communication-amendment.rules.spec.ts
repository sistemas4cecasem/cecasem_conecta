import { randomUUID } from 'node:crypto';
import { amendmentContent, amendmentFingerprint, assertAmendmentAllowed, canInvalidate } from './communication-amendment.rules';
describe('Historia de comunicaciones y autorización contextual', () => {
  it.each(['ADMINISTRATOR', 'BOARD', 'RESEARCH', 'PLANNING'] as const)('%s invalida propia y solo Admin/Directorio invalida ajena', role => {
    expect(canInvalidate(role, 'a', 'a')).toBe(true); expect(canInvalidate(role, 'a', 'b')).toBe(['ADMINISTRATOR', 'BOARD'].includes(role));
  });
  it.each(['CORRECTION', 'ANNOTATION', 'INVALIDATION'] as const)('%s conserva el texto original significativo', type => expect(amendmentContent(type, '  Texto literal\n', randomUUID())).toBe('  Texto literal\n'));
  it.each(['', ' \n\t', null, 1, 'x'.repeat(5001), 'NUL\0'])('rechaza contenido inválido %j', content => expect(() => amendmentContent('CORRECTION', content, randomUUID())).toThrow('INVALID_AMENDMENT'));
  it('no permite segunda invalidación ni corrección tras invalidar; sí observación', () => {
    expect(() => assertAmendmentAllowed('INVALIDATION', 'INVALIDATED')).toThrow('ALREADY_INVALIDATED');
    expect(() => assertAmendmentAllowed('CORRECTION', 'INVALIDATED')).toThrow('ALREADY_INVALIDATED');
    expect(() => assertAmendmentAllowed('ANNOTATION', 'INVALIDATED')).not.toThrow();
  });
  it('clave exige UUID y fingerprint distingue contenido, comunicación y acción', () => {
    expect(() => amendmentContent('ANNOTATION', 'Texto', 'bad')).toThrow('INVALID_AMENDMENT'); const id = randomUUID();
    expect(amendmentFingerprint(id, 'CORRECTION', 'a')).not.toBe(amendmentFingerprint(id, 'ANNOTATION', 'a'));
    expect(amendmentFingerprint(id, 'CORRECTION', 'a')).not.toBe(amendmentFingerprint(id, 'CORRECTION', 'b'));
  });
});
