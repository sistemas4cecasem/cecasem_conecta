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
const phase21 = process.argv.includes('--phase=2.1');
const baseline = [
  '20261001205420_identity_users_roles', '20261001213022_passwords_sessions', '20261001230230_first_access',
  '20261002022103_password_reset_audit', '20261002110000_administration_audit_actions', '20261002110001_minimal_administration',
  ...(!phase21 ? ['20261002164854_organization_directory','20261002170000_directory_constraints'] : []),
];
const migrationNames = fs.readdirSync(migrations).filter(name => fs.statSync(path.join(migrations,name)).isDirectory()).sort();
const targetCount = phase21 ? 8 : migrationNames.length;
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
const targetPath = phase21 ? path.join(temporary,'target') : migrations;
if (phase21) {
  fs.mkdirSync(targetPath);
  for (const migration of migrationNames.slice(0,8)) fs.cpSync(path.join(migrations,migration),path.join(targetPath,migration),{recursive:true});
  fs.copyFileSync(path.join(migrations,'migration_lock.toml'),path.join(targetPath,'migration_lock.toml'));
}
const fullConfig = config('full.config.ts', targetPath);
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
const tables = ['User', 'EmailAccount', 'UserEmailAccount', 'UserSession', 'FirstAccessToken', 'PasswordResetToken', 'AuditEvent',
  ...(!phase21 ? ['Organization','Category','OrganizationCategory','DirectoryChange'] : [])];
async function snapshot(client) {
  const result = {};
  for (const table of tables) result[table] = (await client.query('SELECT * FROM "' + table + '" ORDER BY ' + (table === 'UserEmailAccount' ? '"userId","emailAccountId"' : table === 'OrganizationCategory' ? '"organizationId","categoryId"' : 'id'))).rows;
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
  if (!phase21) {
    const parent=randomUUID(),child=randomUUID(),category=randomUUID(),operation=randomUUID();
    await client.query('INSERT INTO "Organization" (id,name) VALUES ($1,$2)',[parent,'Matriz QA']);
    await client.query('INSERT INTO "Organization" (id,name,"parentId",version,country) VALUES ($1,$2,$3,2,$4)',[child,'Sede QA',parent,'Bolivia']);
    await client.query('INSERT INTO "Category" (id,name,"normalizedName") VALUES ($1,$2,$3)',[category,'Categoría QA','categoría qa']);
    await client.query('INSERT INTO "OrganizationCategory" ("organizationId","categoryId") VALUES ($1,$2)',[child,category]);
    await client.query('INSERT INTO "DirectoryChange" ("organizationId","actorUserId","operationId",field,"previousValue","newValue") VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[child,actor,operation,'country','null','"Bolivia"']);
    await client.query('INSERT INTO "AuditEvent" (action,"actorUserId","organizationId","operationId") VALUES ($1,$2,$3,$4)',['ORGANIZATION_UPDATED',actor,child,operation]);
  }
}
async function verify(client) {
  assert.equal(Number((await client.query('SELECT count(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rows[0].count), targetCount);
  const checks = (await client.query("SELECT conname FROM pg_constraint WHERE conname IN ('Organization_parent_check','DirectoryChange_target_check','AuditEvent_action_fields_check')")).rows;
  assert.equal(checks.length, 3);
  if (!phase21) {
    assert.equal(Number((await client.query('SELECT count(*) AS count FROM "Person"')).rows[0].count),0);
    assert.equal((await client.query("SELECT conname FROM pg_constraint WHERE conname='PersonRelation_dates_check'")).rows.length,1);
  }
}
(async () => {
  try {
    await admin.connect();
    for (const database of databases) { assert(/^cecasem_(clean|upgrade)_[a-f0-9]+_test$/.test(database)); await admin.query('CREATE DATABASE "' + database + '"'); created.push(database); }
    deploy(databases[0], fullConfig);
    const cleanUrl = new URL(sourceUrl); cleanUrl.pathname = '/' + databases[0];
    const clean = new Client({ connectionString: cleanUrl.toString() }); await clean.connect();
    try { await verify(clean); console.log('Limpia: '+targetCount+' migraciones y constraints OK.'); } finally { await clean.end(); }
    deploy(databases[1], baselineConfig);
    const upgradeUrl = new URL(sourceUrl); upgradeUrl.pathname = '/' + databases[1];
    const upgrade = new Client({ connectionString: upgradeUrl.toString() }); await upgrade.connect();
    try {
      assert.equal(Number((await upgrade.query('SELECT count(*) AS count FROM "_prisma_migrations"')).rows[0].count), baseline.length);
      await representative(upgrade); const before = await snapshot(upgrade);
      deploy(databases[1], fullConfig); await verify(upgrade); const after = await snapshot(upgrade);
      for (const table of tables) {
        assert.equal(before[table].length, after[table].length);
        for (let index = 0; index < before[table].length; index++) {
          for (const key of Object.keys(before[table][index])) assert.deepEqual(after[table][index][key], before[table][index][key], table + '.' + key);
        }
      }
      console.log('Upgrade '+baseline.length+'→'+targetCount+': '+tables.length+' tablas preservadas, incluidos sesiones, auditoría, organizaciones, categorías, jerarquía e historial cuando corresponde.');
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
