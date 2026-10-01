import { validateEnvironment } from './environment';

const databaseUrl = 'postgresql://test:example@localhost:5432/cecasem_test';

describe('Environment configuration', () => {
  it('uses development defaults when variables are absent', () => {
    expect(validateEnvironment({ DATABASE_URL: databaseUrl })).toEqual({
      NODE_ENV: 'development',
      APP_PORT: 3000,
      DATABASE_URL: databaseUrl,
    });
  });

  it.each(['development', 'test', 'production'])(
    'accepts NODE_ENV=%s with a configured port',
    (nodeEnv) => {
      expect(validateEnvironment({ NODE_ENV: nodeEnv, APP_PORT: '4100', DATABASE_URL: databaseUrl })).toEqual({
        NODE_ENV: nodeEnv,
        APP_PORT: 4100,
        DATABASE_URL: databaseUrl,
      });
    },
  );

  it.each(['1', '65535', 3000])('accepts valid port %s', (port) => {
    expect(validateEnvironment({ APP_PORT: port, DATABASE_URL: databaseUrl }).APP_PORT).toBe(Number(port));
  });

  it.each(['abc', '', ' ', '0', '65536', '-1', '3000.5', '1e3', '0x10', true])(
    'rejects invalid APP_PORT=%s',
    (port) => {
      expect(() => validateEnvironment({ APP_PORT: port })).toThrow('APP_PORT');
    },
  );

  it.each(['staging', 'Production', ''])(
    'rejects unsupported NODE_ENV=%s',
    (nodeEnv) => {
      expect(() => validateEnvironment({ NODE_ENV: nodeEnv })).toThrow('NODE_ENV');
    },
  );

  it.each([undefined, '', 'not-a-url', 'mysql://localhost/db', 'postgresql://localhost', 'postgresql://localhost:99999/db', 'postgresql://local host/db'])(
    'rejects missing or invalid DATABASE_URL without disclosing its value',
    (databaseUrl) => {
      expect(() => validateEnvironment({ DATABASE_URL: databaseUrl })).toThrow('DATABASE_URL');
    },
  );

  it('does not disclose credentials from an invalid URL', () => {
    expect(() => validateEnvironment({ DATABASE_URL: 'mysql://user:sensitive-password@localhost/db' }))
      .toThrow('DATABASE_URL es obligatoria y debe ser una URL PostgreSQL válida con host y base de datos.');
  });

  it('accepts postgres scheme and percent-encoded credentials', () => {
    const url = 'postgres://test:p%40ss@localhost:5432/cecasem_test';
    expect(validateEnvironment({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });
});
