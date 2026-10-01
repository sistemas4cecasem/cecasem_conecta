import { InvalidIdentityError } from './identity.errors';
import { generateUsername, USERNAME_MAX_ATTEMPTS, USERNAME_MAX_LENGTH } from './username';

describe('Generated username', () => {
  it.each([
    ['Diego', 'Farinas', 'diego.farinas'],
    ['Diego Armando', 'Fariñas Ávila', 'diego.farinas'],
    ['María José', 'Álvarez Pérez', 'maria.alvarez'],
    ['Íñigo', 'Muñoz', 'inigo.munoz'],
    ['Ana-María', 'Pérez-Gómez', 'ana.perez'],
    ["D'Artagnan", "O'Neill", 'dartagnan.oneill'],
    ['D’Artagnan', 'OʼNeill', 'dartagnan.oneill'],
    ['   José   Luis  ', '  García   López  ', 'jose.garcia'],
    ['...--Élena___María', '__Ríos--Gómez', 'elena.rios'],
    ['Ma\u0301ria', 'Mun\u0303oz', 'maria.munoz'],
  ])('generates the first useful components for %s %s', (givenNames, familyNames, expected) => {
    expect(generateUsername(givenNames, familyNames)).toBe(expected);
  });

  it.each([1, 2, 3, 10, USERNAME_MAX_ATTEMPTS])('uses controlled collision suffix %i', (attempt) => {
    const suffix = attempt === 1 ? '' : String(attempt);
    expect(generateUsername('Diego', 'Fariñas', attempt)).toBe(`diego.farinas${suffix}`);
  });

  it('reserves suffix space when both components are long', () => {
    const username = generateUsername('Á'.repeat(150), 'Ñ'.repeat(150), USERNAME_MAX_ATTEMPTS);
    expect(username).toHaveLength(USERNAME_MAX_LENGTH);
    expect(username).toBe(`${'a'.repeat(30)}.${'n'.repeat(30)}100`);
  });

  it.each(['', '   ', '---', '😀'])('rejects a name without useful components', (value) => {
    expect(() => generateUsername(value, 'Pérez')).toThrow(InvalidIdentityError);
    expect(() => generateUsername('Ana', value)).toThrow(InvalidIdentityError);
  });

  it.each([0, -1, 1.5, 101])('rejects an attempt outside the bounded strategy', (attempt) => {
    expect(() => generateUsername('Ana', 'Pérez', attempt)).toThrow(InvalidIdentityError);
  });
});
