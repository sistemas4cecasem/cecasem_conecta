import { closeSync, existsSync, mkdirSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const modes = args.filter((argument) => argument === '--http-lan' || argument === '--secure-cookie');
const outputIndex = args.indexOf('--output');
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : 'infra/production/.env';
if (modes.length !== 1 || !outputPath || args.some((argument, index) => argument === '--output' && index !== outputIndex)) {
  process.stderr.write('Uso: node scripts/lan/create-env.mjs --http-lan|--secure-cookie [--output ruta]\n');
  process.exit(2);
}

const target = resolve(outputPath);
if (existsSync(target)) {
  process.stderr.write('El archivo de entorno ya existe; no se sobrescribió.\n');
  process.exit(1);
}

const databasePassword = randomBytes(32).toString('hex');
const administratorPassword = randomBytes(32).toString('hex');
const secureCookie = modes[0] === '--secure-cookie' ? 'true' : 'false';
const contents = [
  '# Generado localmente. No compartir ni versionar.',
  'WEB_BIND_ADDRESS=0.0.0.0',
  'WEB_PORT=8080',
  'APP_PORT=3000',
  `SESSION_COOKIE_SECURE=${secureCookie}`,
  'POSTGRES_DB=cecasem_conecta',
  'POSTGRES_USER=cecasem',
  `POSTGRES_PASSWORD=${databasePassword}`,
  `POSTGRES_ADMIN_PASSWORD=${administratorPassword}`,
  `DATABASE_URL=postgresql://cecasem:${databasePassword}@db:5432/cecasem_conecta`,
  'FILE_STORAGE_ROOT=/app/storage/private',
  'FILE_MAX_BYTES=20971520',
  'SESSION_TTL_SECONDS=28800',
  'FIRST_ACCESS_TOKEN_TTL_SECONDS=86400',
  'PASSWORD_RESET_TOKEN_TTL_SECONDS=14400',
  'TRANSLATION_ENABLED=false',
  'LIBRETRANSLATE_URL=',
  'LIBRETRANSLATE_API_KEY=',
  'TRANSLATION_TIMEOUT_MS=10000',
  '',
].join('\n');

mkdirSync(dirname(target), { recursive: true });
let descriptor;
let created = false;
try {
  descriptor = openSync(target, 'wx', 0o600);
  created = true;
  writeFileSync(descriptor, contents, { encoding: 'utf8' });
  closeSync(descriptor);
  descriptor = undefined;
} catch {
  if (descriptor !== undefined) {
    closeSync(descriptor);
    descriptor = undefined;
  }
  if (created) try { unlinkSync(target); } catch { /* Preserve the original write error without removing anything else. */ }
  process.stderr.write('No se pudo crear el archivo de entorno. Revisa la ruta y sus permisos.\n');
  process.exit(1);
}

process.stdout.write(`Archivo creado en ${relative(process.cwd(), target) || target}; secretos aleatorios generados y no impresos.\n`);
