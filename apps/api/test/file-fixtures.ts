// Contenedores mínimos para comprobar firmas/estructura; no son documentos de usuarios.
export function officeLegacy(extension: 'doc' | 'xls' | 'ppt') {
  const bytes = Buffer.alloc(1024); Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(bytes); bytes.writeUInt16LE(0xfffe, 28); bytes.writeUInt16LE(9, 30); bytes.writeUInt32LE(0, 48);
  const name = { doc: 'WordDocument', xls: 'Workbook', ppt: 'PowerPoint Document' }[extension];
  Buffer.from(name + '\0', 'utf16le').copy(bytes, 512); bytes.writeUInt16LE((name.length + 1) * 2, 576); bytes[578] = 2; return bytes;
}
export function officeZip(extension: 'docx' | 'xlsx' | 'pptx', macro = false) {
  const entry = { docx: 'word/document.xml', xlsx: 'xl/workbook.xml', pptx: 'ppt/presentation.xml' }[extension];
  const type = { docx: 'wordprocessingml.document.main+xml', xlsx: 'spreadsheetml.sheet.main+xml', pptx: 'presentationml.presentation.main+xml' }[extension];
  const entries = [['[Content_Types].xml', `<Types>${type}</Types>`], ['_rels/.rels', '<Relationships/>'], [entry, '<document/>'], ...(macro ? [['word/vbaProject.bin', 'macro']] : [])];
  const locals: Buffer[] = [], centrals: Buffer[] = []; let offset = 0;
  for (const [name, content] of entries) {
    const filename = Buffer.from(name), data = Buffer.from(content), local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, filename, data); centrals.push(central, filename); offset += local.length + filename.length + data.length;
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
