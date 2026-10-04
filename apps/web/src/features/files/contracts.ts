import { z } from 'zod';
export const EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'png', 'jpg', 'jpeg', 'webp'];
export const fileMetadataSchema = z.object({ id: z.uuid(), originalName: z.string(), mimeType: z.string(), declaredMimeType: z.string(), sizeBytes: z.number().int().positive(), sha256: z.string(),
  createdAt: z.iso.datetime(), processId: z.uuid().nullable(), communicationId: z.uuid().nullable(), incorporation: z.enum(['PROCESS_ATTACHMENT', 'LATER_COMMUNICATION_ATTACHMENT']),
  uploadedBy: z.object({ id: z.uuid(), displayName: z.string(), isActive: z.boolean() }) });
export const filePageSchema = z.object({ items: z.array(fileMetadataSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });
export const fileLimitsSchema = z.object({ maxBytes: z.number().int().positive(), maxFiles: z.number().int().positive().max(10) });
export function selectionError(files: File[], limits: z.infer<typeof fileLimitsSchema>): string | null {
  if (!files.length || files.length > limits.maxFiles) return `Selecciona entre 1 y ${limits.maxFiles} archivos.`;
  for (const file of files) {
    if (!file.size || file.size > limits.maxBytes) return `${file.name}: debe contener entre 1 y ${limits.maxBytes.toLocaleString('es-BO')} bytes.`;
    if (!EXTENSIONS.includes(file.name.split('.').at(-1)?.toLowerCase() ?? '')) return `${file.name}: el tipo no está permitido.`;
  }
  return null;
}
