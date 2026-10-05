import { translationEnvironment } from '../modules/translation/translation-config';
import { fileEnvironment } from '../modules/files/file-config';
import { validateEnvironment } from './environment';

const databaseUrl = 'postgresql://test:example@localhost:5432/cecasem_test';

describe('Environment configuration', () => {
  it.each(['0', '-1', '1.5', '28801', '', true])('rejects unsafe reset TTL %s', (ttl) => {
    expect(() => validateEnvironment({ DATABASE_URL: databaseUrl, PASSWORD_RESET_TOKEN_TTL_SECONDS: ttl })).toThrow('PASSWORD_RESET_TOKEN_TTL_SECONDS');
  });
  it.each(['1', '28800', 14400])('accepts bounded reset TTL %s', (ttl) => {
    expect(validateEnvironment({ DATABASE_URL: databaseUrl, PASSWORD_RESET_TOKEN_TTL_SECONDS: ttl }).PASSWORD_RESET_TOKEN_TTL_SECONDS).toBe(Number(ttl));
  });
  it.each(['0', '-1', '1.5', '172801', '', true])('rejects unsafe first-access TTL %s', (ttl) => {
    expect(() => validateEnvironment({ DATABASE_URL: databaseUrl, FIRST_ACCESS_TOKEN_TTL_SECONDS: ttl })).toThrow('FIRST_ACCESS_TOKEN_TTL_SECONDS');
  });
  it.each(['1', '172800', 86400])('accepts bounded first-access TTL %s', (ttl) => {
    expect(validateEnvironment({ DATABASE_URL: databaseUrl, FIRST_ACCESS_TOKEN_TTL_SECONDS: ttl }).FIRST_ACCESS_TOKEN_TTL_SECONDS).toBe(Number(ttl));
  });
  it.each(['0', '-1', '1.5', '604801', '', true])('rejects unsafe session TTL %s', (ttl) => {
    expect(() => validateEnvironment({ DATABASE_URL: databaseUrl, SESSION_TTL_SECONDS: ttl })).toThrow('SESSION_TTL_SECONDS');
  });
  it.each(['yes', 'False', '', 1])('rejects ambiguous secure cookie option %s', (secure) => {
    expect(() => validateEnvironment({ DATABASE_URL: databaseUrl, SESSION_COOKIE_SECURE: secure })).toThrow('SESSION_COOKIE_SECURE');
  });
  it('uses explicit HTTPS cookie security regardless of NODE_ENV', () => {
    expect(validateEnvironment({ DATABASE_URL: databaseUrl, NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'false' }).SESSION_COOKIE_SECURE).toBe(false);
    expect(validateEnvironment({ DATABASE_URL: databaseUrl, NODE_ENV: 'development', SESSION_COOKIE_SECURE: 'true' }).SESSION_COOKIE_SECURE).toBe(true);
  });
  it('uses development defaults when variables are absent', () => {
    expect(validateEnvironment({ DATABASE_URL: databaseUrl })).toEqual({
      ...fileEnvironment({}),
      ...translationEnvironment({}),
      NODE_ENV: 'development',
      APP_PORT: 3000,
      DATABASE_URL: databaseUrl,
      SESSION_TTL_SECONDS: 28800,
      FIRST_ACCESS_TOKEN_TTL_SECONDS: 86400,
      PASSWORD_RESET_TOKEN_TTL_SECONDS: 14400,
      SESSION_COOKIE_SECURE: false,
    });
  });

  it.each(['development', 'test', 'production'])(
    'accepts NODE_ENV=%s with a configured port',
    (nodeEnv) => {
      expect(validateEnvironment({ NODE_ENV: nodeEnv, APP_PORT: '4100', DATABASE_URL: databaseUrl })).toEqual({
      ...fileEnvironment({}),
      ...translationEnvironment({}),
        NODE_ENV: nodeEnv,
        APP_PORT: 4100,
        DATABASE_URL: databaseUrl,
        SESSION_TTL_SECONDS: 28800,
        FIRST_ACCESS_TOKEN_TTL_SECONDS: 86400,
        PASSWORD_RESET_TOKEN_TTL_SECONDS: 14400,
        SESSION_COOKIE_SECURE: false,
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
