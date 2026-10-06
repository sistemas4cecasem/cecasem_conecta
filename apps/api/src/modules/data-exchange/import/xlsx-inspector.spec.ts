import ExcelJS from 'exceljs';
import { DataImportError } from './import.errors';
import { inspectXlsx, XLSX_IMPORT_LIMITS } from './xlsx-inspector';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function workbookBytes(workbook: ExcelJS.Workbook) {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('inspectXlsx', () => {
  it('muestra hojas y filas de muestra sin presuponer encabezados ni nombres de columnas', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Datos de contacto');
    sheet.addRow(['Institución', 'Correo electrónico', 'Fecha del intercambio']);
    sheet.addRow(['Fundación Ejemplo', 'equipo@example.test', new Date('2024-05-20T00:00:00.000Z')]);

    const result = await inspectXlsx('historico.xlsx', XLSX_MIME, await workbookBytes(workbook));

    expect(result.sheets).toEqual([{ name: 'Datos de contacto', rowCount: 2, columnCount: 3, sample: [
      { rowNumber: 1, cells: [
        { column: 1, value: 'Institución', cellType: 'TEXT' },
        { column: 2, value: 'Correo electrónico', cellType: 'TEXT' },
        { column: 3, value: 'Fecha del intercambio', cellType: 'TEXT' },
      ] },
      { rowNumber: 2, cells: [
        { column: 1, value: 'Fundación Ejemplo', cellType: 'TEXT' },
        { column: 2, value: 'equipo@example.test', cellType: 'TEXT' },
        { column: 3, value: '2024-05-20T00:00:00.000Z', cellType: 'DATE' },
      ] },
    ] }]);
  });

  it('identifica fórmulas sin ejecutar expresiones ni importar su valor', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Hoja 1');
    sheet.addRow(['Valor']);
    sheet.addRow([{ formula: '1+1', result: 2 }]);

    const result = await inspectXlsx('historico.xlsx', XLSX_MIME, await workbookBytes(workbook));

    expect(result.sheets[0].sample[1].cells[0]).toEqual({ column: 1, value: null, cellType: 'FORMULA' });
  });

  it('rechaza otras extensiones, contenido corrupto y archivos sobredimensionados', async () => {
    await expect(inspectXlsx('historico.xls', XLSX_MIME, Buffer.from('not excel'))).rejects.toMatchObject({ code: 'INVALID_UPLOAD' });
    await expect(inspectXlsx('historico.xlsx', XLSX_MIME, Buffer.from('not excel'))).rejects.toMatchObject({ code: 'INVALID_UPLOAD' });
    await expect(inspectXlsx('historico.xlsx', XLSX_MIME, Buffer.alloc(XLSX_IMPORT_LIMITS.maxBytes + 1))).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('rechaza paquetes XLSX corruptos y workbooks que exceden límites de hojas o dimensiones', async () => {
    await expect(inspectXlsx('corrupto.xlsx', XLSX_MIME, Buffer.from('PK\u0003\u0004corrupto'))).rejects.toBeInstanceOf(DataImportError);

    const tooManySheets = new ExcelJS.Workbook();
    for (let index = 0; index <= XLSX_IMPORT_LIMITS.maxSheets; index++) tooManySheets.addWorksheet(`Hoja ${index}`);
    await expect(inspectXlsx('muchas-hojas.xlsx', XLSX_MIME, await workbookBytes(tooManySheets))).rejects.toMatchObject({ code: 'WORKBOOK_LIMIT_EXCEEDED' });

    const tooManyColumns = new ExcelJS.Workbook();
    tooManyColumns.addWorksheet('Datos').getCell(1, XLSX_IMPORT_LIMITS.maxColumns + 1).value = 'fuera de límite';
    await expect(inspectXlsx('muchas-columnas.xlsx', XLSX_MIME, await workbookBytes(tooManyColumns))).rejects.toMatchObject({ code: 'WORKBOOK_LIMIT_EXCEEDED' });
  });
});
