import ExcelJS from 'exceljs';
import { buildExportWorkbook, exportFileName, type ExportRows } from './export-workbook';

describe('XLSX export workbook', () => {
  it('opens the structured organization workbook with literal formula-like text, blanks, filters and stable headers', async () => {
    const rows: NonNullable<ExportRows['organizations']> = [{
      id: 'org-1', name: '=HYPERLINK("https://example.test")', alias: '+cmd', country: '-1+1', isActive: true,
      parent: null, categories: [{ category: { id: 'cat-1', name: '@TEST' } }], contacts: [], createdAt: new Date('2026-10-06T10:15:30.000Z'),
      updatedAt: new Date('2026-10-06T12:30:00.000Z'), lastVerifiedAt: null, verificationStatus: 'NEVER_VERIFIED',
      dataImportBatchId: null, dataImportBatch: null,
    }];
    const workbook = buildExportWorkbook('organizations', { organizations: rows });
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(new Uint8Array(await workbook.xlsx.writeBuffer()).buffer);
    const sheet = reopened.getWorksheet('Organizaciones')!;
    expect(reopened.worksheets.map(item => item.name)).toEqual(['Organizaciones', 'Categorías']);
    expect(sheet.getRow(1).getCell(2).value).toBe('Nombre');
    expect(sheet.getRow(2).getCell(2).value).toBe('=HYPERLINK("https://example.test")');
    expect(sheet.getRow(2).getCell(2).type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getRow(2).getCell(2).formula).toBeUndefined();
    expect(sheet.getRow(2).getCell(3).value).toBe('+cmd');
    expect(sheet.getRow(2).getCell(4).value).toBe('-1+1');
    expect(sheet.autoFilter).toBeDefined();
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(sheet.getRow(2).getCell(9).value).toBeNull();
    expect(reopened.getWorksheet('Categorías')!.getRow(2).getCell(4).value).toBe('@TEST');
    for (const worksheet of reopened.worksheets) {
      worksheet.eachRow(row => row.eachCell(cell => expect(cell.formula).toBeUndefined()));
    }
  });

  it('preserves civil deadlines as YYYY-MM-DD text and omits empty relationship sheets', async () => {
    const rows: NonNullable<ExportRows['opportunities']> = [{
      id: 'opp-1', name: 'Convocatoria', description: null, url: null, deadline: new Date('2026-11-03T00:00:00.000Z'),
      requirements: null, status: 'PENDING_REVIEW', discardReason: null, finalResult: null,
      createdAt: new Date('2026-10-06T10:00:00.000Z'), updatedAt: new Date('2026-10-06T10:00:00.000Z'),
      createdBy: { id: 'user-1', givenNames: 'QA', familyNames: 'User' }, organizations: [], process: null, communication: null,
    }];
    const workbook = buildExportWorkbook('opportunities', { opportunities: rows });
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(new Uint8Array(await workbook.xlsx.writeBuffer()).buffer);
    expect(reopened.worksheets.map(item => item.name)).toEqual(['Oportunidades']);
    expect(reopened.getWorksheet('Oportunidades')!.getRow(2).getCell(6).value).toBe('2026-11-03');
  });

  it('uses a predictable, timezone-stable filename', () => {
    expect(exportFileName('organizations', new Date('2026-10-06T02:00:00.000Z'))).toBe('cecasem-organizations-2026-10-05.xlsx');
  });
});
