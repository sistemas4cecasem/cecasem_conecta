import type { Readable } from 'node:stream';
export type StagedFile = { key: string; sizeBytes: number; sha256: string };
export abstract class FileStorage {
  abstract stage(stream: Readable): Promise<StagedFile>;
  abstract readStaged(key: string): Promise<Buffer>;
  abstract finalize(key: string): Promise<void>;
  abstract discard(key: string, finalized?: boolean): Promise<void>;
  abstract open(key: string, sizeBytes: number, sha256: string): Promise<Readable>;
  abstract candidates(olderThan: Date): Promise<{ key: string; temporary: boolean }[]>;
}
