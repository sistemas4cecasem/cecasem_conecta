import { ConfigService } from '@nestjs/config';
import { mkdtemp, readdir, rm, symlink, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { LocalFileStorage } from './local-file-storage';
import { FILE_MAX_BYTES } from './file-config';
describe('Filesystem privado real', () => {
  let root: string, storage: LocalFileStorage;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'cecasem-files-')); storage = new LocalFileStorage(new ConfigService({ FILE_STORAGE_ROOT: root, FILE_MAX_BYTES })); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });
  it('stage/finalize/stream conserva bytes, tamaño y hash', async () => {
    const bytes = Buffer.from('Contenido institucional'), staged = await storage.stage(Readable.from(bytes));
    expect(staged.sizeBytes).toBe(bytes.length); expect(await storage.readStaged(staged.key)).toEqual(bytes); await storage.finalize(staged.key);
    const chunks = []; for await (const chunk of await storage.open(staged.key, staged.sizeBytes, staged.sha256)) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks)).toEqual(bytes); expect(await readdir(join(root, 'staging'))).toEqual([]);
  });
  it.each([0, FILE_MAX_BYTES + 1])('rechaza %s bytes sin temporal residual', async count => {
    await expect(storage.stage(Readable.from(Buffer.alloc(count)))).rejects.toThrow(); expect(await readdir(join(root, 'staging'))).toEqual([]);
  });
  it('acepta exactamente 20 MiB', async () => { const staged = await storage.stage(Readable.from(Buffer.alloc(FILE_MAX_BYTES, 65))); expect(staged.sizeBytes).toBe(20971520); });
  it.each(['../outside', '/absolute', 'x\\outside', 'not-a-key'])('rechaza storageKey %s', async key => await expect(storage.readStaged(key)).rejects.toThrow());
  it('archivo faltante o corrupto nunca se entrega', async () => {
    const file = await storage.stage(Readable.from('abc')); await storage.finalize(file.key); await writeFile(join(root, 'objects', file.key), 'xyz');
    await expect(storage.open(file.key, 3, file.sha256)).rejects.toThrow(); await storage.discard(file.key, true); await expect(storage.open(file.key, 3, file.sha256)).rejects.toThrow();
  });
  it('no sigue symlink/junction de directorio fuera de raíz', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'cecasem-outside-'));
    try { await symlink(outside, join(root, 'staging'), process.platform === 'win32' ? 'junction' : 'dir'); await expect(storage.stage(Readable.from('abc'))).rejects.toThrow(); expect(await readdir(outside)).toEqual([]); }
    finally { await rm(outside, { recursive: true, force: true }); }
  });
  it('identifica solo claves antiguas regulares y no borra automáticamente', async () => {
    const file = await storage.stage(Readable.from('abc')); const at = new Date(Date.now() - 48 * 3600000); await utimes(join(root, 'staging', file.key), at, at);
    const recent = await storage.stage(Readable.from('recent')); await writeFile(join(root, 'staging', 'unknown.txt'), 'unknown');
    expect(await storage.candidates(new Date(Date.now() - 24 * 3600000))).toEqual([{ key: file.key, temporary: true }]);
    expect(await storage.readStaged(recent.key)).toEqual(Buffer.from('recent')); await expect(storage.open(randomUUID(), 3, file.sha256)).rejects.toThrow();
  });
});
