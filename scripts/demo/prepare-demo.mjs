import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createDemoWorkbook, demoSheets, demoWorkbookFilename, demoWorkbookPath } from './demo-workbook.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultBaseUrl = 'http://127.0.0.1:8087';
const defaultCredentialsPath = resolve(repositoryRoot, 'storage/demo/demo-accounts.local.json');
const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function validateDemoBaseUrl(value, { allowTestPort = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new Error('La URL de demo no es válida.'); }
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  if (url.protocol !== 'http:' || !allowedHosts.has(url.hostname) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('El preparador solo admite una URL HTTP local, sin credenciales ni rutas adicionales.');
  }
  if (url.port === '8080') throw new Error('localhost:8080 es la instancia antigua excluida de Fase 6.');
  if (!allowTestPort && url.port !== '8087') throw new Error('La preparación de demo solo admite el puerto aislado 8087.');
  if (allowTestPort && (!url.port || Number(url.port) < 1 || Number(url.port) > 65535)) throw new Error('El puerto local de prueba no es válido.');
  return url.origin;
}

function collectionItems(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  throw new Error('La API devolvió un formato de lista inesperado.');
}

export function summarizeImportPreview(preview) {
  const rows = preview.rows ?? [];
  const counts = { READY: 0, NEEDS_REVIEW: 0, INVALID: 0 };
  for (const row of rows) if (Object.hasOwn(counts, row.status)) counts[row.status]++;
  return {
    worksheetName: preview.worksheetName,
    recordKind: preview.recordKind,
    batchId: preview.id,
    analyzedRows: preview.analyzedRows,
    readyRows: preview.readyRows,
    reviewRows: preview.reviewRows,
    invalidRows: preview.invalidRows,
    possibleMatches: rows.reduce((count, row) => count + row.matches.filter((match) => match.kind === 'POSSIBLE').length, 0),
    rows: counts,
    review: rows.filter((row) => row.status !== 'READY' || row.matches.length).map((row) => ({
      rowNumber: row.rowNumber,
      status: row.status,
      warnings: (row.warnings ?? []).map((warning) => warning.message),
      errors: (row.errors ?? []).map((error) => error.message),
      matches: row.matches.map(({ field, kind, label, score }) => ({ field, kind, label, score })),
    })),
  };
}

export function decisionsForPreview(preview) {
  const decisions = [];
  for (const row of preview.rows ?? []) {
    const fields = new Set(row.matches.filter((match) => match.kind === 'POSSIBLE').map((match) => match.field));
    for (const field of fields) {
      const candidates = row.matches.filter((match) => match.field === field && match.kind === 'POSSIBLE');
      const exact = row.matches.filter((match) => match.field === field && match.kind === 'EXACT');
      const selected = exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : null;
      if (!selected) throw new Error(`La fila ${row.rowNumber} tiene varias coincidencias posibles en ${field}; revisa el preview en la aplicación.`);
      decisions.push({ rowNumber: row.rowNumber, field, decision: 'LINK_EXISTING', targetId: selected.id });
    }
  }
  return decisions;
}

function setCookie(response) {
  const cookie = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie');
  const pair = cookie?.split(';', 1)[0];
  if (!pair?.startsWith('cecasem_session=')) throw new Error('La API no devolvió la sesión esperada.');
  return pair;
}

function accountPassword() {
  return randomBytes(32).toString('base64url');
}

async function saveRoleCredentials(path, credentials) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ note: 'Contraseñas sintéticas de demo; archivo local ignorado por Git.', accounts: credentials }, null, 2)}\n`, { mode: 0o600 });
}

function excelUpload(bytes, filename) {
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: xlsxMime }), filename);
  return form;
}

async function askToConfirm(previews, { assumeYes = false } = {}) {
  if (assumeYes) return true;
  stdout.write('\nPreview de las hojas que se van a importar:\n');
  for (const preview of previews) stdout.write(`- ${JSON.stringify(summarizeImportPreview(preview))}\n`);
  stdout.write('Las coincidencias posibles se vincularán a la ficha existente; las filas inválidas quedarán fuera.\n');
  const terminal = createInterface({ input: stdin, output: stdout });
  try { return (await terminal.question('Escribe IMPORTAR-6.2 para confirmar la importación explícita: ')).trim() === 'IMPORTAR-6.2'; }
  finally { terminal.close(); }
}

export async function prepareDemoDataset({ baseUrl = defaultBaseUrl, adminEmail, adminPassword, credentialsPath = defaultCredentialsPath,
  workbookPath = demoWorkbookPath, allowTestPort = false, assumeYes = false, fetchImpl = fetch, onPreview } = {}) {
  if (!adminEmail || !adminPassword) throw new Error('Indica CECASEM_DEMO_ADMIN_EMAIL y CECASEM_DEMO_ADMIN_PASSWORD.');
  const origin = validateDemoBaseUrl(baseUrl, { allowTestPort });
  const api = new URL('/api/v1/', origin);
  let cookie = '';

  async function request(method, path, { body, form, headers = {}, authenticated = true } = {}) {
    const requestHeaders = new Headers(headers);
    if (authenticated && cookie && !requestHeaders.has('Cookie')) requestHeaders.set('Cookie', cookie);
    let requestBody;
    if (form) requestBody = form;
    else if (body !== undefined) {
      requestHeaders.set('Content-Type', 'application/json');
      requestBody = JSON.stringify(body);
    }
    let response;
    try { response = await fetchImpl(new URL(path.replace(/^\//u, ''), api), { method, headers: requestHeaders, body: requestBody, redirect: 'error' }); }
    catch { throw new Error(`No se pudo conectar con la API local (${method} ${path}).`); }
    if (!response.ok) throw new Error(`La API rechazó ${method} ${path} (HTTP ${response.status}).`);
    if (response.status === 204) return null;
    const type = response.headers.get('content-type') ?? '';
    return type.includes('application/json') ? response.json() : response.arrayBuffer();
  }

  const health = await request('GET', 'health', { authenticated: false });
  if (health?.status !== 'ok') throw new Error('La instancia local no pasó el control de salud.');
  const loginResponse = await fetchImpl(new URL('auth/login', api), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: adminEmail, password: adminPassword }), redirect: 'error',
  });
  if (!loginResponse.ok) throw new Error('No se pudo autenticar al Administrador indicado.');
  const login = await loginResponse.json();
  if (login.role !== 'ADMINISTRATOR') throw new Error('La cuenta indicada no tiene rol Administrador.');
  cookie = setCookie(loginResponse);

  const users = collectionItems(await request('GET', 'users?status=all'));
  const organizations = collectionItems(await request('GET', 'organizations?status=all&page=1&pageSize=100'));
  const categories = collectionItems(await request('GET', 'categories?status=all&page=1&pageSize=100'));
  const batches = collectionItems(await request('GET', 'data-exchange/imports?page=1&pageSize=100'));
  const markers = [
    users.some((user) => user.email === 'directorio@demo.example.test' || user.email === 'investigacion@demo.example.test' || user.email === 'seguimiento@demo.example.test' || user.email === 'planificacion@demo.example.test'),
    organizations.some((organization) => organization.name === 'Fundación Horizonte Comunitario Demo' || organization.name === 'Fundación Horizonte Comunitaria Demo' || organization.name === 'Colectivo Umbral Claro Demo'),
    categories.some((category) => category.name === 'Cooperación comunitaria (demo 6.2)'),
    batches.some((batch) => batch.originalFilename === demoWorkbookFilename()),
  ];
  if (markers.some(Boolean)) throw new Error('Ya existe parte del dataset 6.2. No se hicieron cambios; reconstruye solo la base aislada cecasem-demo para repetirlo.');

  const credentials = [{ role: 'ADMINISTRATOR', name: `${login.givenNames} ${login.familyNames}`, email: login.email, password: adminPassword }];
  const actors = new Map([['ADMINISTRATOR', { id: login.id, email: login.email, cookie }]]);
  const roleSpecs = [
    { key: 'BOARD', givenNames: 'Directorio', familyNames: 'Demo', email: 'directorio@demo.example.test', role: 'BOARD' },
    { key: 'RESEARCH', givenNames: 'Diego', familyNames: 'Búsqueda Demo', email: 'investigacion@demo.example.test', role: 'RESEARCH' },
    { key: 'RESEARCH_FOLLOW_UP', givenNames: 'Pedro', familyNames: 'Seguimiento Demo', email: 'seguimiento@demo.example.test', role: 'RESEARCH' },
    { key: 'PLANNING', givenNames: 'Planificación', familyNames: 'Demo', email: 'planificacion@demo.example.test', role: 'PLANNING' },
  ];

  for (const spec of roleSpecs) {
    const user = await request('POST', 'users', { body: { givenNames: spec.givenNames, familyNames: spec.familyNames, email: spec.email, role: spec.role } });
    const issued = await request('POST', 'auth/first-access-tokens', { body: { userId: user.id } });
    const password = accountPassword();
    await request('POST', 'auth/first-access', { body: { token: issued.token, password }, authenticated: false });
    const actorLogin = await fetchImpl(new URL('auth/login', api), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: spec.email, password }), redirect: 'error',
    });
    if (!actorLogin.ok) throw new Error(`No se pudo validar el primer acceso del rol ${spec.role}.`);
    const actor = await actorLogin.json();
    const actorCookie = setCookie(actorLogin);
    actors.set(spec.key, { id: actor.id, email: actor.email, cookie: actorCookie });
    credentials.push({ role: spec.role, name: `${spec.givenNames} ${spec.familyNames}`, email: spec.email, password });
    await saveRoleCredentials(credentialsPath, credentials);
  }

  const category = await request('POST', 'categories', { body: { name: 'Cooperación comunitaria (demo 6.2)' } });
  const diego = actors.get('RESEARCH');
  const pedro = actors.get('RESEARCH_FOLLOW_UP');
  const planning = actors.get('PLANNING');

  const organization = await request('POST', 'organizations', { body: {
    name: 'Fundación Horizonte Comunitario Demo', country: 'Bolivia', alias: 'Horizonte Demo',
    description: 'Organización ficticia creada solo para mostrar continuidad de gestión institucional.',
    officialWebsite: 'https://horizonte.example.test', categoryIds: [category.id],
  }, headers: { Cookie: diego.cookie } });
  const similarOrganization = await request('POST', 'organizations', { body: {
    name: 'Fundación Horizonte Comunitaria Demo', country: 'Bolivia', alias: 'Horizonte Comunitaria',
    description: 'Segunda ficha completamente ficticia creada para revisar una posible coincidencia; requiere decisión humana.',
  }, headers: { Cookie: diego.cookie } });
  const restrictedOrganization = await request('POST', 'organizations', { body: {
    name: 'Colectivo Umbral Claro Demo', country: 'Bolivia', alias: 'Umbral Demo',
    description: 'Organización ficticia usada únicamente para mostrar una prevención de contacto.',
  } });
  const duplicateCandidateReview = await request('GET', `organizations/${organization.id}/duplicate-candidates?page=1&pageSize=100`);
  if (!duplicateCandidateReview.items?.some((candidate) => candidate.state === 'PENDING')) {
    throw new Error('La revisión real de duplicados no detectó el par sintético previsto.');
  }
  const person = await request('POST', 'people', { body: { displayName: 'Ana Contacto Demo', givenNames: 'Ana', familyNames: 'Contacto Demo' }, headers: { Cookie: diego.cookie } });
  await request('POST', `people/${person.id}/relations`, { body: {
    organizationId: organization.id, positionTitle: 'Coordinadora de programas Demo', area: 'Cooperación comunitaria',
    isCurrent: true, sourceDescription: 'Relación ficticia preparada para demostración.',
  }, headers: { Cookie: diego.cookie } });
  await request('POST', `people/${person.id}/contacts`, { body: {
    type: 'EMAIL', value: 'ana@horizonte.example.test', label: 'Contacto de demostración',
    sourceDescription: 'Dato enteramente sintético; pendiente de verificación.', notes: 'Dominio reservado para prueba.',
  }, headers: { Cookie: diego.cookie } });
  await request('POST', `organizations/${organization.id}/contacts`, { body: {
    type: 'EMAIL', value: 'contacto@horizonte.example.test', label: 'Contacto institucional de demostración',
    sourceDescription: 'Dato enteramente sintético; pendiente de verificación.', notes: 'Dominio reservado para prueba.',
  }, headers: { Cookie: diego.cookie } });

  const intent = await request('POST', 'contact-intents', { body: {
    purpose: 'Explorar talleres ficticios de aprendizaje comunitario con Fundación Horizonte Comunitario Demo.', organizationId: organization.id,
  }, headers: { Cookie: diego.cookie } });
  const converted = await request('POST', `contact-intents/${intent.id}/convert`, { body: { expectedVersion: intent.version }, headers: { Cookie: diego.cookie } });
  const process = converted.process;

  const mailbox = await request('POST', 'email-accounts', { body: {
    address: 'buzon.demo@demo.example.test', displayName: 'Buzón ficticio de demostración', provider: 'Canal manual ficticio; no sincronizado',
  } });
  await request('PUT', `users/${diego.id}/email-accounts/${mailbox.id}`);
  const sentAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sent = await request('POST', `relationship-processes/${process.id}/communications/sent`, {
    body: { emailAccountId: mailbox.id, sentAt, to: ['ana@horizonte.example.test'], cc: ['contacto@horizonte.example.test'], bcc: [],
      subject: 'Propuesta ficticia de talleres comunitarios',
      body: 'Mensaje sintético de Búsqueda Demo: proponemos conversar sobre talleres ficticios. No se envió ningún correo desde CECASEM Conecta.' },
    headers: { Cookie: diego.cookie, 'Idempotency-Key': randomUUID() },
  });
  const received = await request('POST', `relationship-processes/${process.id}/communications/received`, {
    body: { sender: 'ana@horizonte.example.test', receivedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      to: ['buzon.demo@demo.example.test'], cc: [], bcc: [], subject: 'Respuesta ficticia y propuesta de reunión',
      body: 'Respuesta sintética: aceptamos conversar sobre talleres ficticios y proponemos una reunión de planificación.' },
    headers: { Cookie: pedro.cookie, 'Idempotency-Key': randomUUID() },
  });

  const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const opportunity = await request('POST', 'opportunities', { body: {
    name: 'Convocatoria ficticia de talleres comunitarios', description: 'Oportunidad enteramente sintética derivada de la respuesta registrada.',
    url: 'https://convocatoria.example.test/demo-6-2', deadline,
    requirements: 'Preparar un calendario ficticio y una propuesta de talleres para la comunidad.',
    organizationIds: [organization.id], processId: process.id, communicationId: received.id,
  }, headers: { Cookie: planning.cookie, 'Idempotency-Key': randomUUID() } });
  const preparing = await request('POST', `opportunities/${opportunity.id}/state`, {
    body: { expectedVersion: opportunity.version, status: 'PREPARING' }, headers: { Cookie: planning.cookie },
  });

  const meetingDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let meeting = await request('POST', 'meetings', { body: {
    scheduledLocal: `${meetingDate}T10:30`, timezone: 'America/La_Paz', modality: 'ONLINE',
    meetingUrl: 'https://reunion.example.test/demo-6-2',
    purpose: 'Revisar el calendario ficticio de talleres y asignar próximos pasos.', processId: process.id, opportunityId: opportunity.id,
  }, headers: { Cookie: planning.cookie, 'Idempotency-Key': randomUUID() } });
  const participants = [
    { userId: diego.id }, { userId: pedro.id }, { personId: person.id },
  ];
  for (const participant of participants) {
    meeting = await request('POST', `meetings/${meeting.id}/participants`, {
      body: { ...participant, expectedVersion: meeting.version }, headers: { Cookie: planning.cookie, 'Idempotency-Key': randomUUID() },
    });
  }

  const restriction = await request('POST', 'contact-restrictions', { body: {
    organizationId: restrictedOrganization.id,
    reason: 'Solicitud ficticia de no iniciar nuevos contactos, para mostrar la prevención en el Directorio.',
  } });

  const workbook = await createDemoWorkbook();
  await mkdir(dirname(workbookPath), { recursive: true });
  await writeFile(workbookPath, workbook);
  const inspect = await request('POST', 'data-exchange/imports/inspect', { form: excelUpload(workbook, demoWorkbookFilename()) });
  const inspectedNames = (inspect.sheets ?? []).map((sheet) => sheet.name);
  if (!demoSheets.every((sheet) => inspectedNames.includes(sheet.name))) throw new Error('La inspección real de Excel no encontró todas las hojas esperadas.');

  const previews = [];
  const confirmedBatches = [];
  for (const definition of demoSheets) {
    const before = await readDirectoryCounts(request);
    if (onPreview) await onPreview({ stage: 'before', definition, preview: null, directoryCounts: before });
    const form = excelUpload(workbook, demoWorkbookFilename());
    form.set('worksheetName', definition.name);
    form.set('headerRow', '1');
    form.set('recordKind', definition.recordKind);
    form.set('columnMapping', JSON.stringify(definition.columnMapping));
    const preview = await request('POST', 'data-exchange/imports/preview', { form });
    const after = await readDirectoryCounts(request);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`El preview de ${definition.name} modificó fichas del Directorio.`);
    previews.push(preview);
    if (onPreview) await onPreview({ stage: 'after', definition, preview, directoryCounts: after });
    if (definition.name === 'Organizaciones' && !preview.rows.some((row) => row.matches.some((match) => match.kind === 'POSSIBLE'))) {
      throw new Error('La muestra ya no presenta la coincidencia posible prevista; se detuvo antes de confirmar.');
    }
    if (!await askToConfirm([preview], { assumeYes })) {
      throw new Error(`Importación de ${definition.name} cancelada; el preview permanece como lote técnico. Para repetir, reconstruye solo la base aislada cecasem-demo.`);
    }
    const confirmed = await request('POST', `data-exchange/imports/${preview.id}/confirm`, { body: { decisions: decisionsForPreview(preview) } });
    if (confirmed.status !== 'IMPORTED') throw new Error(`La confirmación de ${preview.worksheetName} no completó la importación.`);
    confirmedBatches.push({ id: confirmed.id, status: confirmed.status, importedRows: confirmed.importedRows, invalidRows: confirmed.invalidRows });
  }

  for (const actor of actors.values()) {
    if (actor.cookie) {
      try { await request('POST', 'auth/logout', { body: {}, headers: { Cookie: actor.cookie } }); } catch { /* Las sesiones expiran y son revocables desde la administración. */ }
    }
  }
  await saveRoleCredentials(credentialsPath, credentials);
  return {
    organizationId: organization.id, similarOrganizationId: similarOrganization.id, restrictedOrganizationId: restrictedOrganization.id, personId: person.id,
    intentId: intent.id, processId: process.id, sentCommunicationId: sent.id, receivedCommunicationId: received.id,
    opportunityId: preparing.id, meetingId: meeting.id, restrictionId: restriction.id,
    batches: confirmedBatches, credentialsPath, workbookPath,
    previews: previews.map(summarizeImportPreview),
  };
}

async function readDirectoryCounts(request) {
  const [organizations, people, contacts] = await Promise.all([
    request('GET', 'organizations?status=all&page=1&pageSize=100'),
    request('GET', 'people?status=all&page=1&pageSize=100'),
    request('GET', 'contact-methods?page=1&pageSize=100'),
  ]);
  return { organizations: organizations.total, people: people.total, contactMethods: contacts.total };
}

async function main() {
  try {
    const result = await prepareDemoDataset({
      baseUrl: process.env.CECASEM_DEMO_BASE_URL ?? defaultBaseUrl,
      adminEmail: process.env.CECASEM_DEMO_ADMIN_EMAIL,
      adminPassword: process.env.CECASEM_DEMO_ADMIN_PASSWORD,
    });
    stdout.write('\nDataset de demostración preparado.\n');
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    stdout.write('Las contraseñas sintéticas de los cuatro roles están en el archivo local indicado; no se imprimieron.\n');
  } catch (error) {
    stdout.write(`Preparación detenida: ${error instanceof Error ? error.message : 'error inesperado'}.\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
