import { InvalidIdentityError } from './identity.errors';
import { normalizeEmail, normalizeIdentityText } from './identity-normalization';

describe('Institutional email normalization', () => {
  it.each([
    ['Diego@CECASEM.com', 'diego@cecasem.com'],
    ['  Diego@CECASEM.com  ', 'diego@cecasem.com'],
    ['\tDiego@CECASEM.com\n', 'diego@cecasem.com'],
    ['Diego.Armando+Proyecto@CECASEM.com', 'diego.armando+proyecto@cecasem.com'],
  ])('normalizes %s without provider-specific transformations', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });

  it.each(['', '   ', 'not-an-email', 'diego @cecasem.com', 'diego@@cecasem.com', 'diego@', '@cecasem.com', `${'a'.repeat(250)}@example.test`])(
    'rejects invalid input %s', (input) => {
      expect(() => normalizeEmail(input)).toThrow(InvalidIdentityError);
    },
  );

  it('uses the same canonical value when normalized again', () => {
    const email = normalizeEmail(' Diego.Armando+Proyecto@CECASEM.com ');
    expect(normalizeEmail(email)).toBe(email);
  });
});

describe('Identity descriptive text', () => {
  it('preserves compound names and accents while normalizing whitespace', () => {
    expect(normalizeIdentityText('  María\t José  ', 'Nombres')).toBe('María José');
  });

  it.each([' ', 'a'.repeat(151)])('rejects empty or oversized text', (value) => {
    expect(() => normalizeIdentityText(value, 'Nombres')).toThrow(InvalidIdentityError);
  });
});
