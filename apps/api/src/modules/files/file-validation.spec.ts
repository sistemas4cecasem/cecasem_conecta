import { safeOriginalName, validateFile, FILE_TYPES } from './file-validation';
import { fileEnvironment, FILE_MAX_BYTES } from './file-config';
import { resolve } from 'node:path';
import { officeZip, officeLegacy } from '../../../test/file-fixtures';
describe('Validación de archivos institucionales', () => {
  it.each(['../a.pdf', 'a/b.pdf', 'a\\b.pdf', 'a\0.pdf', 'a\n.pdf', '', ' ', '.', '..', 'a'.repeat(256)])('rechaza nombre inseguro %j', value => expect(() => safeOriginalName(value)).toThrow());
  it('conserva Unicode sin usarlo como ruta', () => expect(safeOriginalName('Convenio CECASEM — Perú.pdf')).toBe('Convenio CECASEM — Perú.pdf'));
  it.each([
    ['pdf', Buffer.from('%PDF-1.7\ncontenido\n%%EOF')], ['txt', Buffer.from('Acuerdo institucional áéíóú')], ['csv', Buffer.from('Nombre,País\nCECASEM,Bolivia')],
    ['png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvXcAAAAASUVORK5CYII=', 'base64')],
    ['jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9])], ['jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9])],
  ] as const)('acepta %s con comprobación de contenido', (extension, bytes) => expect(validateFile('documento.' + extension, 'application/octet-stream', bytes)).toBe(FILE_TYPES[extension]));
  it.each(['doc', 'xls', 'ppt'] as const)('reconoce CFB %s y rechaza renombrarlo', extension => {
    expect(validateFile('d.' + extension, FILE_TYPES[extension], officeLegacy(extension))).toBe(FILE_TYPES[extension]);
    expect(() => validateFile('d.doc', FILE_TYPES.doc, officeLegacy('xls'))).toThrow();
  });
  it.each(['docx', 'xlsx', 'pptx'] as const)('reconoce paquete OOXML %s', extension => {
    expect(validateFile('d.' + extension, FILE_TYPES[extension], officeZip(extension))).toBe(FILE_TYPES[extension]);
    expect(() => validateFile('d.docx', FILE_TYPES.docx, officeZip('xlsx'))).toThrow();
  });
  it.each(['exe', 'js', 'html', 'zip', 'rar', 'svg', 'unknown'])('rechaza extensión %s', extension => expect(() => validateFile('d.' + extension, 'application/octet-stream', Buffer.from('contenido'))).toThrow());
  it.each([Buffer.alloc(0), Buffer.from('MZ ejecutable'), Buffer.from('<html><script>alert(1)</script></html>'), Buffer.from('texto\0binario')])('rechaza contenido incompatible', bytes => expect(() => validateFile('d.txt', 'text/plain', bytes)).toThrow());
  it('rechaza MIME incompatible y paquete con macros', () => {
    expect(() => validateFile('d.pdf', 'text/plain', Buffer.from('%PDF-1.7\n%%EOF'))).toThrow();
    expect(() => validateFile('d.docx', FILE_TYPES.docx, officeZip('docx', true))).toThrow();
  });
  it('configura límite exacto y ruta absoluta', () => expect(fileEnvironment({ FILE_STORAGE_ROOT: resolve('test-storage') })).toEqual({ FILE_STORAGE_ROOT: resolve('test-storage'), FILE_MAX_BYTES }));
  it.each([0, -1, FILE_MAX_BYTES + 1, 1.5, true, {}, '1e3', ''])('rechaza límite inválido %j', limit => expect(() => fileEnvironment({ FILE_MAX_BYTES: limit })).toThrow());
  it('rechaza raíz relativa y acepta límite reducido', () => { expect(() => fileEnvironment({ FILE_STORAGE_ROOT: 'relative' })).toThrow(); expect(fileEnvironment({ FILE_MAX_BYTES: '1024' }).FILE_MAX_BYTES).toBe(1024); });
});
