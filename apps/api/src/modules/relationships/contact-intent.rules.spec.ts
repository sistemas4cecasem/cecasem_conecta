import { ContactIntentState, UserRole } from '../../generated/prisma/client';
import { canCancelIntent, intentPurpose, intentTarget, requireActiveIntent } from './contact-intent.rules';
describe('Reglas de intenciones', () => {
  it.each([UserRole.ADMINISTRATOR, UserRole.BOARD])('%s puede cancelar ajena', role => expect(canCancelIntent(role, 'reader', 'author')).toBe(true));
  it.each([UserRole.RESEARCH, UserRole.PLANNING])('%s solo cancela propia', role => {
    expect(canCancelIntent(role, 'author', 'author')).toBe(true); expect(canCancelIntent(role, 'other', 'author')).toBe(false);
  });
  it('rol desconocido no recibe excepción ni propiedad', () => expect(canCancelIntent('UNKNOWN' as UserRole, 'author', 'author')).toBe(false));
  it.each([{}, { organizationId: 'org', personId: 'person' }])('rechaza objetivo inválido %j', input => expect(() => intentTarget(input)).toThrow('INVALID_INTENT'));
  it.each([{ organizationId: 'org' }, { personId: 'person' }])('acepta un único objetivo %j', input => expect(intentTarget(input)).toEqual(input));
  it.each(['', ' \n\t ', 'a'.repeat(5001)])('rechaza propósito inválido', purpose => expect(() => intentPurpose(purpose)).toThrow('INVALID_INTENT'));
  it('conserva contenido y saltos internos del propósito', () => expect(intentPurpose('  Propuesta\ncooperación  ')).toBe('Propuesta\ncooperación'));
  it.each([ContactIntentState.CANCELLED, ContactIntentState.CLOSED, ContactIntentState.CONVERTED])('no cancela %s', state => expect(() => requireActiveIntent(state, 2, 2)).toThrow('INTENT_NOT_ACTIVE'));
  it('versión obsoleta es conflicto', () => expect(() => requireActiveIntent(ContactIntentState.ACTIVE, 2, 1)).toThrow('VERSION_CONFLICT'));
  it.each([0, -1, 1.5])('rechaza versión inválida %s', version => expect(() => requireActiveIntent(ContactIntentState.ACTIVE, 1, version)).toThrow('INVALID_INTENT'));
});
