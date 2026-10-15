import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoWorkbook, demoSheets } from './demo-workbook.mjs';
import { decisionsForPreview, summarizeImportPreview, validateDemoBaseUrl, provisionDemoAccount } from './prepare-demo.mjs';

test('la preparación normal solo acepta el servidor demo local aislado', () => {
  assert.equal(validateDemoBaseUrl('http://127.0.0.1:8087'), 'http://127.0.0.1:8087');
  assert.throws(() => validateDemoBaseUrl('http://localhost:8080'), /instancia antigua/u);
  assert.throws(() => validateDemoBaseUrl('https://demo.example.test:8087'), /URL HTTP local/u);
  assert.throws(() => validateDemoBaseUrl('http://192.168.1.10:8087'), /URL HTTP local/u);
  assert.throws(() => validateDemoBaseUrl('http://localhost:3000'), /puerto aislado/u);
  assert.equal(validateDemoBaseUrl('http://127.0.0.1:41235', { allowTestPort: true }), 'http://127.0.0.1:41235');
});

test('el resumen del preview mantiene errores, revisión y coincidencias visibles', () => {
  const result = summarizeImportPreview({
    id: 'lote-sintético', worksheetName: 'Organizaciones', recordKind: 'ORGANIZATION', analyzedRows: 3,
    readyRows: 0, reviewRows: 2, invalidRows: 1,
    rows: [
      { status: 'NEEDS_REVIEW', matches: [{ kind: 'POSSIBLE' }] },
      { status: 'NEEDS_REVIEW', matches: [] },
      { status: 'INVALID', matches: [] },
    ],
  });
  assert.deepEqual(result.rows, { READY: 0, NEEDS_REVIEW: 2, INVALID: 1 });
  assert.equal(result.possibleMatches, 1);
});

test('la decisión automática solo vincula una coincidencia posible inequívoca', () => {
  assert.deepEqual(decisionsForPreview({ rows: [{ rowNumber: 2, matches: [
    { field: 'organizationName', kind: 'EXACT', id: 'uuid-exacto' },
    { field: 'organizationName', kind: 'POSSIBLE', id: 'uuid-posible' },
  ] }] }), [{ rowNumber: 2, field: 'organizationName', decision: 'LINK_EXISTING', targetId: 'uuid-exacto' }]);
  assert.deepEqual(decisionsForPreview({ rows: [{ rowNumber: 2, matches: [
    { field: 'organizationName', kind: 'POSSIBLE', id: 'uuid-demo' },
  ] }] }), [{ rowNumber: 2, field: 'organizationName', decision: 'LINK_EXISTING', targetId: 'uuid-demo' }]);
  assert.throws(() => decisionsForPreview({ rows: [{ rowNumber: 2, matches: [
    { field: 'organizationName', kind: 'POSSIBLE', id: 'uuid-a' },
    { field: 'organizationName', kind: 'POSSIBLE', id: 'uuid-b' },
  ] }] }), /varias coincidencias posibles/u);
});

test('el libro contiene cuatro hojas pequeñas y solo contactos de dominios reservados', async () => {
  const bytes = await createDemoWorkbook();
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), demoSheets.map((sheet) => sheet.name));
  assert.ok(workbook.worksheets.every((sheet) => sheet.rowCount <= 5));
  const contactValues = demoSheets.flatMap((sheet) => sheet.rows.flatMap((row) => row.filter((value) => typeof value === 'string' && value.includes('@'))));
  assert.ok(contactValues.length > 0);
  assert.ok(contactValues.every((value) => /@[^@]+\.example\.test$/u.test(value)));
  assert.equal(workbook.worksheets.find((sheet) => sheet.name === 'Organizaciones').getRow(1).getCell(6).value, 'Área de interés sugerida');
});
for (const failure of [null, 'create', 'change', 'established']) {
  test(`aprovisionamiento usa contraseña inicial y contrato vigente; fallo=${failure}`, async () => {
    const spec = { givenNames: 'Demo', familyNames: 'Prueba', email: 'demo@example.test', role: 'RESEARCH' };
    const initialPassword = 'Aa!inicial-demo'; const password = 'Bb!personal-demo';
    const calls = [];
    const fetchImpl = async (url, options) => {
      const path = url.pathname; const body = JSON.parse(options.body); calls.push(path);
      assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
      if (calls.length === 1) {
        assert.equal(path, '/api/v1/users'); assert.deepEqual(body, { ...spec, password: initialPassword }); assert.equal(options.headers.Cookie, 'cecasem_session=admin');
        return failure === 'create' ? new Response(null, { status: 400 }) : Response.json({ id: 'user' }, { status: 201 });
      }
      if (calls.length === 2) {
        assert.equal(path, '/api/v1/auth/login'); assert.deepEqual(body, { email: spec.email, password: initialPassword }); assert.equal(options.headers.Cookie, undefined);
        return Response.json({ id: 'user', mustChangePassword: true }, { headers: { 'Set-Cookie': 'cecasem_session=initial; HttpOnly' } });
      }
      if (calls.length === 3) {
        assert.equal(path, '/api/v1/auth/change-password'); assert.deepEqual(body, { password }); assert.equal(options.headers.Cookie, 'cecasem_session=initial');
        return new Response(null, { status: failure === 'change' ? 409 : 204, headers: { 'Set-Cookie': 'cecasem_session=rotated; HttpOnly' } });
      }
      assert.equal(options.headers.Cookie, 'cecasem_session=rotated'); assert.equal(calls.length, 4); assert.equal(path, '/api/v1/auth/login'); assert.deepEqual(body, { email: spec.email, password });
      return Response.json({ id: 'user', email: spec.email, role: spec.role, mustChangePassword: failure === 'established' }, { headers: { 'Set-Cookie': 'cecasem_session=personal; HttpOnly' } });
    };
    const run = () => provisionDemoAccount({ api: new URL('http://127.0.0.1:8087/api/v1/'), adminCookie: 'cecasem_session=admin', spec, initialPassword, password, fetchImpl });
    if (failure) await assert.rejects(run);
    else assert.deepEqual(await run(), { id: 'user', email: spec.email, cookie: 'cecasem_session=personal' });
    assert.equal(calls.length, failure === 'create' ? 1 : failure === 'change' ? 3 : 4);
  });
}
