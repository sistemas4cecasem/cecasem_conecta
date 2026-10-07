import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoWorkbook, demoSheets } from './demo-workbook.mjs';
import { decisionsForPreview, summarizeImportPreview, validateDemoBaseUrl } from './prepare-demo.mjs';

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
  assert.equal(workbook.worksheets.find((sheet) => sheet.name === 'Organizaciones').getRow(1).getCell(6).value, 'Categoría propuesta');
});
