import { describe, expect, it } from 'vitest';
import { identitySchema } from './session';
import { hasPermission } from './permissions';

const identity = { id: 'fixture', givenNames: 'Ana', familyNames: 'Prueba', username: 'ana.prueba',
  email: 'fixture@example.test', role: 'BOARD' };

describe('Contrato de capabilities recibidas', () => {
  it('permissions es obligatorio, incluso cuando no hay capabilities', () => {
    expect(identitySchema.safeParse(identity).success).toBe(false);
    expect(identitySchema.parse({ ...identity, permissions: [] }).permissions).toEqual([]);
  });
  it('acepta strings futuras sin replicar el catálogo backend', () => {
    const permissions = ['auth.first_access.issue', 'future.fixture.permission'];
    expect(identitySchema.parse({ ...identity, permissions }).permissions).toEqual(permissions);
    expect(hasPermission(permissions, 'future.fixture.permission')).toBe(true);
    expect(hasPermission(permissions, 'auth.password_reset.issue')).toBe(false);
    expect(hasPermission([], 'auth.first_access.issue')).toBe(false);
  });
  it.each([null, 'auth.first_access.issue', {}, [1], [null], [true]].map(permissions => ({ permissions })))('rechaza permissions inválidas: $permissions', ({ permissions }) => {
    expect(identitySchema.safeParse({ ...identity, permissions }).success).toBe(false);
  });
});
