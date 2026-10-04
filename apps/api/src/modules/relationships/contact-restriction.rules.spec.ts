import { RestrictionState, UserRole } from '../../generated/prisma/client';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS } from '../auth/authorization/permission';
import { restrictionReason, restrictionTarget, requireActiveRestriction } from './contact-restriction.rules';
describe('Reglas de restricción explícita', () => {
  it.each([{ organizationId: 'org' }, { personId: 'person' }])('objetivo válido %j', target => expect(restrictionTarget(target)).toEqual(target));
  it.each([{}, { organizationId: 'org', personId: 'person' }])('objetivo exclusivo %j', target => expect(() => restrictionTarget(target)).toThrow('INVALID_RESTRICTION'));
  it.each(['', ' \n\t ', 'x'.repeat(5001)])('motivo inválido', reason => expect(() => restrictionReason(reason)).toThrow('INVALID_RESTRICTION'));
  it('conserva motivo con saltos internos', () => expect(restrictionReason(' Solicitud\nexpresa ')).toBe('Solicitud\nexpresa'));
  it('levantamiento exige activa y versión vigente', () => { expect(() => requireActiveRestriction(RestrictionState.ACTIVE, 1, 1)).not.toThrow();
    expect(() => requireActiveRestriction(RestrictionState.LIFTED, 2, 2)).toThrow('RESTRICTION_ALREADY_LIFTED');
    expect(() => requireActiveRestriction(RestrictionState.ACTIVE, 1, 2)).toThrow('VERSION_CONFLICT'); });
  it.each([0, -1, 1.5])('versión inválida %s', version => expect(() => requireActiveRestriction(RestrictionState.ACTIVE, 1, version)).toThrow('INVALID_RESTRICTION'));
  it.each(Object.values(UserRole))('%s registro y lectura; levantamiento reservado', role => {
    expect(hasPermission(role, PERMISSIONS.RESTRICTION_CREATE)).toBe(true); expect(hasPermission(role, PERMISSIONS.RESTRICTION_READ)).toBe(true);
    expect(hasPermission(role, PERMISSIONS.RESTRICTION_LIFT)).toBe(role === UserRole.ADMINISTRATOR || role === UserRole.BOARD);
  });
});
