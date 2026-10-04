import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, link, unlink } from 'node:fs/promises';
import { dirname, join, parse, relative, resolve, sep } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { AppEnvironment } from '../../config/environment';
import { FileError } from './file-errors';
import { FileStorage, type StagedFile } from './file-storage';

@Injectable()
export class LocalFileStorage extends FileStorage {
  private readonly receivingKeys = new Set<string>();
  constructor(private readonly config: ConfigService<AppEnvironment, true>) { super(); }
  private key(key: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key)) throw new FileError('FILE_UNAVAILABLE');
  }
  private async directory(temporary: boolean): Promise<string> {
    const root = resolve(this.config.get('FILE_STORAGE_ROOT', { infer: true }));
    // No se aceptan symlinks/junctions en ningún componente, ni siquiera en la raíz configurada.
    let current = parse(root).root;
    for (const component of root.slice(current.length).split(sep).filter(Boolean)) {
      current = join(current, component);
      await mkdir(current, { mode: 0o700 }).catch((error: unknown) => { if (!isFsError(error, 'EEXIST')) throw error; });
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new FileError('FILE_UNAVAILABLE');
    }
    const directory = join(root, temporary ? 'staging' : 'objects');
    await mkdir(directory, { mode: 0o700 }).catch((error: unknown) => { if (!isFsError(error, 'EEXIST')) throw error; });
    const stat = await lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || relative(await realpath(root), await realpath(directory)) !== (temporary ? 'staging' : 'objects')) throw new FileError('FILE_UNAVAILABLE');
    return directory;
  }
  private async path(key: string, temporary: boolean) { this.key(key); return join(await this.directory(temporary), key); }
  async stage(stream: Readable): Promise<StagedFile> {
    const key = randomUUID(), path = await this.path(key, true), hash = createHash('sha256');
    this.receivingKeys.add(key);
    let sizeBytes = 0;
    const counter = new Transform({ transform: (chunk: Buffer, _encoding, callback) => {
      sizeBytes += chunk.length;
      if (sizeBytes > this.config.get('FILE_MAX_BYTES', { infer: true })) return callback(new FileError('FILE_TOO_LARGE'));
      hash.update(chunk); callback(null, chunk);
    } });
    try {
      const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      await pipeline(stream, counter, handle.createWriteStream());
      if (!sizeBytes) throw new FileError('INVALID_UPLOAD');
      return { key, sizeBytes, sha256: hash.digest('hex') };
    } catch (error) { await this.discard(key); throw error; }
    finally { this.receivingKeys.delete(key); }
  }
  private async handle(key: string, temporary: boolean, writable = false) {
    const path = await this.path(key, temporary), stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile() || dirname(await realpath(path)) !== await realpath(dirname(path))) throw new FileError('FILE_UNAVAILABLE');
    return open(path, (writable ? constants.O_RDWR : constants.O_RDONLY) | constants.O_NOFOLLOW);
  }
  async readStaged(key: string) { const handle = await this.handle(key, true); try { return await handle.readFile(); } finally { await handle.close(); } }
  async finalize(key: string) {
    const source = await this.path(key, true), destination = await this.path(key, false);
    const handle = await this.handle(key, true, true); try { await handle.sync(); } finally { await handle.close(); }
    await link(source, destination); await unlink(source);
  }
  async discard(key: string, finalized = false) {
    const path = await this.path(key, !finalized);
    // unlink retira la entrada, nunca sigue un symlink.
    await unlink(path).catch((error: unknown) => { if (!isFsError(error, 'ENOENT')) throw error; });
  }
  async open(key: string, sizeBytes: number, sha256: string): Promise<Readable> {
    try {
      const handle = await this.handle(key, false);
      try {
        if ((await handle.stat()).size !== sizeBytes) throw new FileError('FILE_UNAVAILABLE');
        const hash = createHash('sha256');
        for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk as Buffer);
        if (hash.digest('hex') !== sha256) throw new FileError('FILE_UNAVAILABLE');
        return handle.createReadStream({ start: 0, autoClose: true });
      } catch (error) { await handle.close(); throw error; }
    } catch { throw new FileError('FILE_UNAVAILABLE'); }
  }
  async candidates(olderThan: Date) {
    const candidates: { key: string; temporary: boolean }[] = [];
    for (const temporary of [true, false]) {
      const directory = await this.directory(temporary);
      for (const key of await readdir(directory)) {
        if (!/^[0-9a-f-]{36}$/.test(key) || this.receivingKeys.has(key)) continue;
        const stat = await lstat(join(directory, key));
        if (stat.isFile() && !stat.isSymbolicLink() && stat.mtime < olderThan) candidates.push({ key, temporary });
      }
    }
    return candidates;
  }
}
function isFsError(error: unknown, code: string): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === code; }
