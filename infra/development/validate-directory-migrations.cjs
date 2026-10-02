// Solo QA aislado. No modifica ni reinicia las bases existentes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID, randomBytes } = require('node:crypto');
const { Client } = require('pg');

const root = path.resolve(__dirname, '../..');
const sourceUrl = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(sourceUrl.hostname) && sourceUrl.pathname.endsWith('_test'), 'Requiere DATABASE_URL loopback terminada en _test.');
const migrations = path.join(root, 'apps/api/prisma/migrations');
const baseline = [
  '20261001205420_identity_users_roles', '20261001213022_passwords_sessions', '20261001230230_first_access',
  '20261002022103_password_reset_audit', '20261002110000_administration_audit_actions', '20261002110001_minimal_administration',
];
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cecasem-directory-migrations-'));
const suffix = randomBytes(6).toString('hex');
const databases = ['cecasem_clean_' + suffix + '_test', 'cecasem_upgrade_' + suffix + '_test'];
const adminUrl = new URL(sourceUrl); adminUrl.pathname = '/postgres';
const admin = new Client({ connectionString: adminUrl.toString() });
const created = [];
function config(file, migrationsPath) {
  const configPath = path.join(temporary, file);
  fs.writeFileSync(configPath, 'export default ' + JSON.stringify({ schema: path.join(root, 'apps/api/prisma/schema.prisma'), migrations: { path: migrationsPath } }).replace(/}$/, ', datasource: { url: process.env.DATABASE_URL } };'));
  return configPath;
}
const fullConfig = config('full.config.ts', migrations);
const staged = path.join(temporary, 'baseline'); fs.mkdirSync(staged);
for (const migration of baseline) fs.cpSync(path.join(migrations, migration), path.join(staged, migration), { recursive: true });
fs.copyFileSync(path.join(migrations, 'migration_lock.toml'), path.join(staged, 'migration_lock.toml'));
const baselineConfig = config('baseline.config.ts', staged);
function deploy(database, configPath) {
  const url = new URL(sourceUrl); url.pathname = '/' + database;
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', configPath],
    { cwd: path.join(root, 'apps/api'), env: { ...process.env, DATABASE_URL: url.toString() }, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('migrate deploy falló: ' + result.stdout + result.stderr);
}
const tables = ['User', 'EmailAccount', 'UserEmailAccount', 'UserSession', 'FirstAccessToken', 'PasswordResetToken', 'AuditEvent'];
async function snapshot(client) {
  const result = {};
  for (const table of tables) result[table] = (await client.query('SELECT * FROM "' + table + '" ORDER BY ' + (table === 'UserEmailAccount' ? '"userId","emailAccountId"' : 'id'))).rows;
  return result;
}
async function representative(client) {
  const actor = randomUUID(), user = randomUUID(), account = randomUUID(), reset = randomUUID();
  for (const [id, username, role] of [[actor, 'qa.admin', 'ADMINISTRATOR'], [user, 'qa.research', 'RESEARCH']]) {
    await client.query('INSERT INTO "User" (id,"givenNames","familyNames",username,email,role,"passwordHash") VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, 'QA', 'Migraciones', username, username + '@example.test', role, 'fixture-not-a-login-credential']);
  }
  await client.query('INSERT INTO "EmailAccount" (id,address,"displayName") VALUES ($1,$2,$3)', [account, 'qa@example.test', 'QA Institucional']);
  await client.query('INSERT INTO "UserEmailAccount" ("userId","emailAccountId") VALUES ($1,$2)', [user, account]);
  for (const table of ['UserSession', 'FirstAccessToken', 'PasswordResetToken']) {
    const withIssuer = table !== 'UserSession';
    await client.query('INSERT INTO "' + table + '" (id,"userId","tokenHash","expiresAt"' + (withIssuer ? ',"createdByUserId"' : '') + ") VALUES ($1,$2,$3,now() + interval '1 hour'" + (withIssuer ? ',$4' : '') + ')',
      [table === 'PasswordResetToken' ? reset : randomUUID(), user, randomBytes(32).toString('hex'), ...(withIssuer ? [actor] : [])]);
  }
  await client.query('INSERT INTO "AuditEvent" (action,"actorUserId","targetUserId","passwordResetTokenId") VALUES ($1,$2,$3,$4)', ['PASSWORD_RESET_ISSUED', actor, user, reset]);
  await client.query('INSERT INTO "AuditEvent" (action,"actorUserId","targetUserId","emailAccountId") VALUES ($1,$2,$3,$4)', ['MAILBOX_ASSIGNED', actor, user, account]);
}
async function verify(client) {
  assert.equal(Number((await client.query('SELECT count(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rows[0].count), 8);
  assert.equal(Number((await client.query('SELECT count(*) AS count FROM "Organization"')).rows[0].count), 0);
  const checks = (await client.query("SELECT conname FROM pg_constraint WHERE conname IN ('Organization_parent_check','DirectoryChange_target_check','AuditEvent_action_fields_check')")).rows;
  assert.equal(checks.length, 3);
}
(async () => {
  try {
    await admin.connect();
    for (const database of databases) { assert(/^cecasem_(clean|upgrade)_[a-f0-9]+_test$/.test(database)); await admin.query('CREATE DATABASE "' + database + '"'); created.push(database); }
    deploy(databases[0], fullConfig);
    const cleanUrl = new URL(sourceUrl); cleanUrl.pathname = '/' + databases[0];
    const clean = new Client({ connectionString: cleanUrl.toString() }); await clean.connect();
    try { await verify(clean); console.log('Limpia: ocho migraciones y constraints OK.'); } finally { await clean.end(); }
    deploy(databases[1], baselineConfig);
    const upgradeUrl = new URL(sourceUrl); upgradeUrl.pathname = '/' + databases[1];
    const upgrade = new Client({ connectionString: upgradeUrl.toString() }); await upgrade.connect();
    try {
      assert.equal(Number((await upgrade.query('SELECT count(*) AS count FROM "_prisma_migrations"')).rows[0].count), 6);
      await representative(upgrade); const before = await snapshot(upgrade);
      deploy(databases[1], fullConfig); await verify(upgrade); const after = await snapshot(upgrade);
      for (const table of tables) {
        assert.equal(before[table].length, after[table].length);
        for (let index = 0; index < before[table].length; index++) {
          for (const key of Object.keys(before[table][index])) assert.deepEqual(after[table][index][key], before[table][index][key], table + '.' + key);
        }
      }
      console.log('Upgrade 6→8: siete tablas de Fase 1 preservadas, incluidos sesiones, tokens, buzón y auditoría.');
    } finally { await upgrade.end(); }
  } finally {
    for (const database of created) await admin.query('DROP DATABASE "' + database + '" WITH (FORCE)');
    await admin.end();
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
    assert(path.basename(temporary).startsWith('cecasem-directory-migrations-'));
    fs.rmSync(temporary, { recursive: true, force: true });
    console.log('QA: bases y staging temporales eliminados.');
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
