import ExcelJS from 'exceljs';
import { safeOriginalName, validateFile } from '../../files/file-validation';
import { DataImportError } from './import.errors';

export const XLSX_IMPORT_LIMITS = Object.freeze({ maxBytes: 20 * 1024 * 1024, maxSheets: 5, maxRows: 5000, maxColumns: 50, sampleRows: 10 });

export interface InspectedCell {
  column: number;
  value: string | number | boolean | null;
  cellType: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'FORMULA' | 'UNSUPPORTED' | 'EMPTY';
}

export interface InspectedRow {
  rowNumber: number;
  cells: InspectedCell[];
}

export interface InspectedSheet {
  name: string;
  rowCount: number;
  columnCount: number;
  sample: InspectedRow[];
}

export interface InspectedWorkbook {
  originalName: string;
  sheets: InspectedSheet[];
}

export type ReadableCell = InspectedCell;

export interface ReadableRow {
  rowNumber: number;
  cells: ReadableCell[];
}

function assertPackageBounds(bytes: Buffer): void {
  const first = Math.max(0, bytes.length - 65_557);
  let end = bytes.length - 22;
  while (end >= first && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < first || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0) throw new DataImportError('INVALID_UPLOAD');
  const entries = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  let position = bytes.readUInt32LE(end + 16);
  if (!entries || entries > 512 || position + centralSize !== end) throw new DataImportError('WORKBOOK_LIMIT_EXCEEDED');
  let expandedBytes = 0;
  for (let index = 0; index < entries; index++) {
    if (bytes.readUInt32LE(position) !== 0x02014b50) throw new DataImportError('INVALID_UPLOAD');
    const flags = bytes.readUInt16LE(position + 8);
    const method = bytes.readUInt16LE(position + 10);
    const compressedSize = bytes.readUInt32LE(position + 20);
    const uncompressedSize = bytes.readUInt32LE(position + 24);
    const nameLength = bytes.readUInt16LE(position + 28);
    const extraLength = bytes.readUInt16LE(position + 30);
    const commentLength = bytes.readUInt16LE(position + 32);
    if (flags & 1 || ![0, 8].includes(method) || position + 46 + nameLength + extraLength + commentLength > end) throw new DataImportError('INVALID_UPLOAD');
    if (uncompressedSize > 32 * 1024 * 1024 || (compressedSize === 0 && uncompressedSize > 0) || (compressedSize > 0 && uncompressedSize / compressedSize > 100)) throw new DataImportError('WORKBOOK_LIMIT_EXCEEDED');
    expandedBytes += uncompressedSize;
    if (expandedBytes > 64 * 1024 * 1024) throw new DataImportError('WORKBOOK_LIMIT_EXCEEDED');
    position += 46 + nameLength + extraLength + commentLength;
  }
  if (position !== end) throw new DataImportError('INVALID_UPLOAD');
}

function cellContent(value: ExcelJS.CellValue): Pick<InspectedCell, 'value' | 'cellType'> {
  if (value === null || value === undefined) return { value: null, cellType: 'EMPTY' };
  if (value instanceof Date) return { value: value.toISOString(), cellType: 'DATE' };
  if (typeof value === 'string') return { value, cellType: 'TEXT' };
  if (typeof value === 'number') return { value, cellType: 'NUMBER' };
  if (typeof value === 'boolean') return { value, cellType: 'BOOLEAN' };
  if (typeof value === 'object' && 'formula' in value) return { value: null, cellType: 'FORMULA' };
  if (typeof value === 'object' && 'richText' in value) return { value: value.richText.map(part => part.text).join(''), cellType: 'TEXT' };
  if (typeof value === 'object' && 'text' in value && 'hyperlink' in value) return { value: value.text, cellType: 'TEXT' };
  return { value: null, cellType: 'UNSUPPORTED' };
}

function nonEmptyCells(row: ExcelJS.Row): InspectedCell[] {
  const cells: InspectedCell[] = [];
  row.eachCell({ includeEmpty: false }, cell => {
    const content = cellContent(cell.value);
    if (content.cellType !== 'EMPTY') cells.push({ column: cell.fullAddress.col, ...content });
  });
  return cells;
}

/**
 * Inspects an XLSX without assuming worksheet names, header rows or legacy
 * column names. Formula expressions are reported as formulas; ExcelJS never
 * evaluates them and their cached result is not used as imported data.
 */
export async function inspectXlsx(originalName: string, mimeType: string, bytes: Buffer): Promise<InspectedWorkbook> {
  try { safeOriginalName(originalName); } catch { throw new DataImportError('INVALID_UPLOAD'); }
  if (!originalName.toLowerCase().endsWith('.xlsx') || !bytes.length) throw new DataImportError('INVALID_UPLOAD');
  if (bytes.byteLength > XLSX_IMPORT_LIMITS.maxBytes) throw new DataImportError('FILE_TOO_LARGE');
  try { validateFile(originalName, mimeType, bytes); } catch { throw new DataImportError('INVALID_UPLOAD'); }
  assertPackageBounds(bytes);

  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]); } catch { throw new DataImportError('INVALID_WORKBOOK'); }
  if (workbook.worksheets.length < 1 || workbook.worksheets.length > XLSX_IMPORT_LIMITS.maxSheets) throw new DataImportError('WORKBOOK_LIMIT_EXCEEDED');

  const sheets = workbook.worksheets.map(sheet => {
    const rowCount = sheet.rowCount;
    const columnCount = sheet.columnCount;
    if (rowCount > XLSX_IMPORT_LIMITS.maxRows || columnCount > XLSX_IMPORT_LIMITS.maxColumns) throw new DataImportError('WORKBOOK_LIMIT_EXCEEDED');
    const sample: InspectedRow[] = [];
    sheet.eachRow({ includeEmpty: false }, row => {
      if (sample.length < XLSX_IMPORT_LIMITS.sampleRows) sample.push({ rowNumber: row.number, cells: nonEmptyCells(row) });
    });
    return { name: sheet.name, rowCount, columnCount, sample };
  });
  return { originalName, sheets };
}

export async function readXlsxSheet(originalName: string, mimeType: string, bytes: Buffer, worksheetName: string, headerRow: number): Promise<{ headers: InspectedCell[]; rows: ReadableRow[] }> {
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > XLSX_IMPORT_LIMITS.maxRows) throw new DataImportError('INVALID_UPLOAD');
  try { safeOriginalName(originalName); } catch { throw new DataImportError('INVALID_UPLOAD'); }
  if (!originalName.toLowerCase().endsWith('.xlsx') || !bytes.length) throw new DataImportError('INVALID_UPLOAD');
  if (bytes.byteLength > XLSX_IMPORT_LIMITS.maxBytes) throw new DataImportError('FILE_TOO_LARGE');
  try { validateFile(originalName, mimeType, bytes); } catch { throw new DataImportError('INVALID_UPLOAD'); }
  assertPackageBounds(bytes);
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]); } catch { throw new DataImportError('INVALID_WORKBOOK'); }
  const sheet = workbook.getWorksheet(worksheetName);
  if (!sheet || sheet.rowCount > XLSX_IMPORT_LIMITS.maxRows || sheet.columnCount > XLSX_IMPORT_LIMITS.maxColumns) throw new DataImportError('WORKBOOK_LIMIT_EXCEEDED');
  const headers = nonEmptyCells(sheet.getRow(headerRow));
  if (!headers.length) throw new DataImportError('INVALID_WORKBOOK', 'No se encontraron encabezados en la fila seleccionada.');
  const rows: ReadableRow[] = [];
  sheet.eachRow({ includeEmpty: false }, row => {
    if (row.number <= headerRow) return;
    const cells = nonEmptyCells(row);
    if (cells.length) rows.push({ rowNumber: row.number, cells });
  });
  return { headers, rows };
}
