import { spawnSync } from 'node:child_process';
import { isIP } from 'node:net';
import { resolve } from 'node:path';

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

const envFile = argument('--env-file', 'infra/production/.env');
const projectName = argument('--project-name', 'cecasem_conecta');
if (!envFile || !projectName || process.argv.some((value, index) => ['--env-file', '--project-name'].includes(value) && !process.argv[index + 1])) {
  process.stderr.write('Uso: node scripts/lan/validate-compose-config.mjs [--env-file ruta] [--project-name nombre]\n');
  process.exit(2);
}

const config = spawnSync('docker', [
  'compose', '--project-name', projectName, '--env-file', resolve(envFile),
  '-f', 'docker-compose.yml', 'config', '--format', 'json',
], { encoding: 'utf8', windowsHide: true });
if (config.error || config.status !== 0) {
  process.stderr.write('Docker Compose rechazó la configuración; revisa variables obligatorias localmente sin compartir su salida.\n');
  process.exit(1);
}

let model;
try {
  model = JSON.parse(config.stdout);
} catch {
  process.stderr.write('Docker Compose no produjo una configuración JSON válida.\n');
  process.exit(1);
}

const problems = [];
const db = model.services?.db;
const api = model.services?.api;
const web = model.services?.web;
const dbEnv = db?.environment ?? {};
const apiEnv = api?.environment ?? {};
for (const key of ['POSTGRES_DB', 'POSTGRES_APP_USER', 'POSTGRES_APP_PASSWORD', 'POSTGRES_PASSWORD']) {
  if (!(key in dbEnv) || dbEnv[key] === '') problems.push(`falta ${key}`);
}
for (const key of ['DATABASE_URL', 'SESSION_COOKIE_SECURE']) {
  if (!(key in apiEnv) || apiEnv[key] === '') problems.push(`falta ${key}`);
}

try {
  const url = new URL(apiEnv.DATABASE_URL);
  const decoded = (value) => decodeURIComponent(value);
  const database = decodeURIComponent(url.pathname.replace(/^\//u, ''));
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== 'db' || (url.port && url.port !== '5432')) problems.push('DATABASE_URL debe usar PostgreSQL interno en db:5432');
  if (decoded(url.username) !== dbEnv.POSTGRES_APP_USER) problems.push('DATABASE_URL y POSTGRES_APP_USER no coinciden');
  if (decoded(url.password) !== dbEnv.POSTGRES_APP_PASSWORD) problems.push('DATABASE_URL y POSTGRES_APP_PASSWORD no coinciden');
  if (database !== dbEnv.POSTGRES_DB) problems.push('DATABASE_URL y POSTGRES_DB no coinciden');
} catch {
  problems.push('DATABASE_URL no es una URL PostgreSQL válida');
}

if (dbEnv.POSTGRES_USER !== 'postgres') problems.push('la cuenta administrativa PostgreSQL debe seguir siendo postgres');
if (dbEnv.POSTGRES_APP_USER === 'postgres') problems.push('POSTGRES_APP_USER no puede ser postgres');
if (dbEnv.POSTGRES_APP_PASSWORD === dbEnv.POSTGRES_PASSWORD) problems.push('las credenciales runtime y administrativas deben ser distintas');
if (['password', 'secret', 'changeme', 'development_only', 'bootstrap_development_only'].includes(String(dbEnv.POSTGRES_APP_PASSWORD).toLowerCase())) problems.push('POSTGRES_PASSWORD conserva un valor de ejemplo inseguro');
if (['password', 'secret', 'changeme', 'development_only', 'bootstrap_development_only'].includes(String(dbEnv.POSTGRES_PASSWORD).toLowerCase())) problems.push('POSTGRES_ADMIN_PASSWORD conserva un valor de ejemplo inseguro');

if (apiEnv.NODE_ENV !== 'production') problems.push('API debe usar NODE_ENV=production');
if (!['true', 'false'].includes(String(apiEnv.SESSION_COOKIE_SECURE))) problems.push('SESSION_COOKIE_SECURE debe elegirse explícitamente');
if (!isIP(String(web?.ports?.[0]?.host_ip ?? ''))) problems.push('WEB_BIND_ADDRESS debe ser una dirección IP explícita');
if (typeof apiEnv.FILE_STORAGE_ROOT !== 'string' || !apiEnv.FILE_STORAGE_ROOT.startsWith('/')) problems.push('FILE_STORAGE_ROOT debe ser una ruta absoluta del contenedor');
if (!Number.isInteger(Number(apiEnv.FILE_MAX_BYTES)) || Number(apiEnv.FILE_MAX_BYTES) < 1 || Number(apiEnv.FILE_MAX_BYTES) > 20 * 1024 * 1024) problems.push('FILE_MAX_BYTES debe estar entre 1 y 20971520');
const webPort = web?.ports?.[0];
if (!Number.isInteger(Number(webPort?.published)) || Number(webPort?.published) < 1 || Number(webPort?.published) > 65535) problems.push('WEB_PORT debe estar entre 1 y 65535');
if (!Number.isInteger(Number(apiEnv.APP_PORT)) || Number(apiEnv.APP_PORT) < 1 || Number(apiEnv.APP_PORT) > 65535) problems.push('APP_PORT debe estar entre 1 y 65535');
if (db?.ports?.length) problems.push('PostgreSQL no debe publicar puertos al host');
if (api?.ports?.length) problems.push('API no debe publicar puertos al host');
if (!db?.healthcheck || !api?.healthcheck || !web?.healthcheck) problems.push('cada servicio debe declarar healthcheck');
if (model.networks?.data?.internal !== true) problems.push('la red de datos debe ser interna');
if (!api?.volumes?.some((volume) => volume.source === 'private_files' && volume.target === apiEnv.FILE_STORAGE_ROOT)) problems.push('uploads deben persistir en private_files en FILE_STORAGE_ROOT');

if (problems.length) {
  process.stderr.write(`Configuración LAN inválida:\n${problems.map((problem) => `- ${problem}`).join('\n')}\n`);
  process.exit(1);
}

const published = webPort;
process.stdout.write(`Configuración válida: proyecto ${model.name}, web ${published.host_ip}:${published.published}; DB/API internos; volúmenes y healthchecks declarados. No se imprimieron credenciales.\n`);
