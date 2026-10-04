import { extname } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { FileError } from './file-errors';

export const FILE_TYPES = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', csv: 'text/csv', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
} as const;
export function safeOriginalName(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 255 || (hasControl(value) || value.includes('/') || value.includes('\\')) || value === '.' || value === '..') throw new FileError('INVALID_UPLOAD');
  return value.normalize('NFC');
}
export function validateFile(name: string, declaredMime: string, bytes: Buffer): string {
  safeOriginalName(name);
  const extension = extname(name).slice(1).toLowerCase();
  if (!Object.hasOwn(FILE_TYPES, extension) || !bytes.length) throw new FileError('UNSUPPORTED_FILE');
  const mime = FILE_TYPES[extension as keyof typeof FILE_TYPES];
  const declared = declaredMime.toLowerCase().split(';')[0]?.trim();
  // application/octet-stream es habitual en los navegadores: siempre se valida el contenido.
  if (declared !== mime && declared !== 'application/octet-stream' && !(extension === 'csv' && declared === 'text/plain')) throw new FileError('UNSUPPORTED_FILE');
  let valid = false;
  switch (extension) {
    case 'pdf': valid = bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) && bytes.subarray(-1024).includes(Buffer.from('%%EOF')); break;
    case 'png': valid = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && bytes.subarray(12, 16).toString() === 'IHDR' && bytes.subarray(-8, -4).toString() === 'IEND'; break;
    case 'jpg': case 'jpeg': valid = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9])); break;
    case 'webp': valid = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' && bytes.length >= 20 && bytes.readUInt32LE(4) + 8 === bytes.length && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.subarray(12, 16).toString()); break;
    case 'txt': case 'csv': {
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        // Texto plano UTF-8; no admitir contenido HTML/script activo renombrado.
        valid = !['MZ', 'PK', '%PDF', '\u007fELF'].some(signature => text.startsWith(signature)) && !hasControl(text, true) && !/<\s*(?:!doctype\s+html|html|script|svg|iframe|object)\b/i.test(text) && !/^\s*(?:#!|<\?php|@echo\s+off|(?:function|import|def|const|let|var)\s|(?:alert|eval|exec)\s*\()/i.test(text);
      } catch { valid = false; }
      break;
    }
    case 'doc': case 'xls': case 'ppt': valid = legacyOffice(bytes, extension); break;
    case 'docx': case 'xlsx': case 'pptx': valid = officePackage(bytes, extension); break;
  }
  if (!valid) throw new FileError('UNSUPPORTED_FILE');
  return mime;
}
function legacyOffice(bytes: Buffer, extension: string): boolean {
  if (bytes.length < 512 || !bytes.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex')) || bytes.readUInt16LE(28) !== 0xfffe) return false;
  const sectorSize = 2 ** bytes.readUInt16LE(30);
  if (![512, 4096].includes(sectorSize)) return false;
  // Inspección de entradas de directorio CFB, no de texto arbitrario del cuerpo.
  const directorySector = bytes.readUInt32LE(48), offset = (directorySector + 1) * sectorSize;
  if (offset + sectorSize > bytes.length) return false;
  const names: string[] = [];
  for (let position = offset; position + 128 <= offset + sectorSize; position += 128) {
    const length = bytes.readUInt16LE(position + 64);
    if (length >= 2 && length <= 64 && bytes[position + 66] === 2) names.push(bytes.subarray(position, position + length - 2).toString('utf16le'));
  }
  return extension === 'doc' ? names.includes('WordDocument') : extension === 'xls' ? names.some(name => ['Workbook', 'Book'].includes(name)) : names.includes('PowerPoint Document');
}
function officePackage(bytes: Buffer, extension: string): boolean {
  try {
    // ZIP se acepta exclusivamente como contenedor OOXML; nunca se extrae al filesystem.
    if (bytes.readUInt32LE(0) !== 0x04034b50) return false;
    let end = bytes.length - 22;
    while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
    if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) return false;
    const count = bytes.readUInt16LE(end + 10), centralSize = bytes.readUInt32LE(end + 12);
    let position = bytes.readUInt32LE(end + 16);
    if (!count || count > 10000 || position + centralSize !== end) return false;
    const names = new Set<string>(); let contentTypes = '';
    for (let index = 0; index < count; index++) {
      if (bytes.readUInt32LE(position) !== 0x02014b50 || bytes.readUInt16LE(position + 8) & 1) return false;
      const length = bytes.readUInt16LE(position + 28), compressed = bytes.readUInt32LE(position + 20);
      const name = bytes.subarray(position + 46, position + 46 + length).toString('utf8');
      if (names.has(name) || name.includes('..') || (name.includes('\\') || name.includes('\0')) || name.startsWith('/') || /vbaProject|macros|activeX/i.test(name)) return false;
      names.add(name);
      if (name === '[Content_Types].xml') {
        const local = bytes.readUInt32LE(position + 42);
        if (bytes.readUInt32LE(local) !== 0x04034b50) return false;
        const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
        if (start + compressed > position || compressed > 131072) return false;
        const data = bytes.subarray(start, start + compressed), method = bytes.readUInt16LE(position + 10);
        contentTypes = (method === 0 ? data : method === 8 ? inflateRawSync(data, { maxOutputLength: 131072 }) : Buffer.alloc(0)).toString('utf8');
      }
      position += 46 + length + bytes.readUInt16LE(position + 30) + bytes.readUInt16LE(position + 32);
    }
    const required = { docx: 'word/document.xml', xlsx: 'xl/workbook.xml', pptx: 'ppt/presentation.xml' }[extension];
    const mainType = { docx: 'wordprocessingml.document.main+xml', xlsx: 'spreadsheetml.sheet.main+xml', pptx: 'presentationml.presentation.main+xml' }[extension];
    return position === end && names.has('_rels/.rels') && !!required && names.has(required) && !!mainType && contentTypes.includes(mainType) && !/macroEnabled|vbaProject/i.test(contentTypes);
  } catch { return false; }
}

function hasControl(value: string, text = false): boolean {
  for (let i = 0; i < value.length; i++) { const code = value.charCodeAt(i); if ((code < 32 || code === 127) && !(text && [9, 10, 13].includes(code))) return true; }
  return false;
}
