import { bootstrapArguments } from './bootstrap-arguments';

describe('Argumentos de aprovisionamiento offline', () => {
  const args = ['--given-names', 'Ana', '--family-names', 'Prueba', '--email', 'fixture@example.test'];
  it('solo admite datos de identidad', () => {
    expect(bootstrapArguments(args)).toEqual({ givenNames: 'Ana', familyNames: 'Prueba', email: 'fixture@example.test' });
  });
  it.each(['password', 'role', 'username', 'token'])('rechaza --%s', field => {
    expect(() => bootstrapArguments([...args, `--${field}`, 'fixture'])).toThrow();
  });
  it('rechaza datos incompletos y argumentos posicionales', () => {
    expect(() => bootstrapArguments([])).toThrow();
    expect(() => bootstrapArguments([...args, 'fixture'])).toThrow();
  });
});
