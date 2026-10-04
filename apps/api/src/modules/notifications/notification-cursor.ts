import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';

export interface NotificationCursor { createdAt: Date; id: string }
export function notificationCursor(value?: string): NotificationCursor | undefined {
  if (value === undefined) return undefined;
  try {
    if (value.length > 512 || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error();
    const row: unknown = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (!row || typeof row !== 'object' || !('id' in row) || typeof row.id !== 'string' || !isUUID(row.id) ||
      !('createdAt' in row) || typeof row.createdAt !== 'string' || new Date(row.createdAt).toISOString() !== row.createdAt) throw new Error();
    return { id: row.id, createdAt: new Date(row.createdAt) };
  } catch { throw new BadRequestException('No se pudo continuar el listado. Vuelve a cargar las notificaciones.'); }
}
export function encodeNotificationCursor(row: NotificationCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id })).toString('base64url');
}
