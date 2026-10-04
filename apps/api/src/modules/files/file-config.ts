import { isAbsolute, resolve } from 'node:path';
export const FILE_MAX_BYTES = 20 * 1024 * 1024;
export const FILE_MAX_COUNT = 10;
export function fileEnvironment(environment: Record<string, unknown>) {
  const root = environment.FILE_STORAGE_ROOT ?? resolve(process.cwd(), 'storage', 'private');
  const limit = environment.FILE_MAX_BYTES ?? FILE_MAX_BYTES;
  if (typeof root !== 'string' || !isAbsolute(root) || root.includes('\0')) throw new Error('FILE_STORAGE_ROOT debe ser una ruta absoluta privada.');
  // El proxy admite 10 archivos de hasta 20 MiB. Una ampliación requiere revisar también Nginx.
  if ((typeof limit !== 'string' && typeof limit !== 'number') || !/^\d+$/.test(String(limit)) || typeof limit === 'boolean' || !Number.isSafeInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > FILE_MAX_BYTES) throw new Error('FILE_MAX_BYTES debe estar entre 1 y 20971520.');
  return { FILE_STORAGE_ROOT: resolve(root), FILE_MAX_BYTES: Number(limit) };
}
