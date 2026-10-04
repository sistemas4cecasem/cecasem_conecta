import { contextTarget, CONTEXT_READ_PERMISSIONS } from './relationship-context.rules';
import { UserRole } from '../../generated/prisma/client';
import { hasPermission } from '../auth/authorization/role-permissions';
describe('Objetivo y permisos de contexto institucional', () => {
  it.each([{}, { organizationId: 'org', personId: 'person' }])('rechaza objetivo ambiguo %j', input => expect(() => contextTarget(input)).toThrow('INVALID_CONTEXT_TARGET'));
  it.each([{ organizationId: 'org' }, { personId: 'person' }])('conserva el objetivo exacto %j', input => expect(contextTarget(input)).toEqual(input));
  it.each(Object.values(UserRole))('%s consulta con permisos de lectura existentes', role => expect(CONTEXT_READ_PERMISSIONS.every(permission => hasPermission(role, permission))).toBe(true));
});
