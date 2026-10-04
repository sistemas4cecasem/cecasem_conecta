import { z } from 'zod';
import { pageSchema } from '../directory/contracts';
import { amendmentSchema } from './amendment-contracts';
export const accountSchema = z.object({ id: z.uuid(), address: z.email(), displayName: z.string() });
export const accountsSchema = z.array(accountSchema);
export const communicationSummarySchema = z.object({ validity: z.enum(['VALID', 'INVALIDATED']).default('VALID'), id: z.uuid(), processId: z.uuid(), direction: z.enum(['SENT', 'RECEIVED']), subject: z.string(), sentAt: z.iso.datetime().nullable(), receivedAt: z.iso.datetime().nullable(), occurredAt: z.iso.datetime(), createdAt: z.iso.datetime() })
  .refine(row => row.direction === 'SENT' ? row.sentAt !== null && row.receivedAt === null && row.occurredAt === row.sentAt : row.receivedAt !== null && row.sentAt === null && row.occurredAt === row.receivedAt, 'La fecha real debe corresponder a la dirección de la comunicación.');
export const communicationSchema = communicationSummarySchema.safeExtend({ validity: z.enum(['VALID', 'INVALIDATED']), invalidation: amendmentSchema.nullable().default(null), version: z.number().int().positive(), emailAccount: accountSchema.nullable(), sender: z.string(), bodyOriginal: z.string(),
  registeredBy: z.object({ id: z.uuid(), displayName: z.string(), isActive: z.boolean() }),
  recipients: z.array(z.object({ type: z.enum(['TO', 'CC', 'BCC']), addressOriginal: z.string(), normalizedAddress: z.string(), position: z.number().int().nonnegative(), emailAccount: z.object({ id: z.uuid(), displayName: z.string() }).nullable().optional() })) })
  .refine(row => row.direction === 'SENT' ? row.emailAccount !== null : row.emailAccount === null, 'La cuenta de envío no corresponde a la dirección de la comunicación.');
export function communicationDate(row: z.infer<typeof communicationSummarySchema>): string { return row.occurredAt; }
export const communicationsPageSchema = pageSchema(communicationSummarySchema);
export type Communication = z.infer<typeof communicationSchema>;
export function addresses(value: string): string[] { return value.split(/[,;\n]/).map(address => address.trim()).filter(Boolean); }
const addressField = z.string().refine(value => addresses(value).every(address => address.length <= 254 && z.email().safeParse(address).success), 'Revisa las direcciones de correo.');
export const sentFormSchema = z.object({ emailAccountId: z.uuid('Selecciona una cuenta habilitada.'), to: addressField.refine(value => addresses(value).length > 0, 'Incluye al menos un destinatario Para.'), cc: addressField, bcc: addressField,
  subject: z.string().min(1, 'Indica el asunto.').max(998, 'Máximo 998 caracteres.').refine(value => !!value.trim() && !/[\r\n\0]/.test(value), 'Revisa el asunto.'),
  body: z.string().min(1, 'Incluye el cuerpo original.').max(200000, 'Máximo 200000 caracteres.').refine(value => !!value.trim() && !value.includes('\0'), 'Revisa el cuerpo original.'),
  sentAt: z.string().min(1, 'Indica la fecha real de envío.').refine(value => Number.isFinite(+new Date(value)) && +new Date(value) <= Date.now(), 'Indica una fecha real válida que no sea futura.') })
  .refine(value => addresses(value.to).length + addresses(value.cc).length + addresses(value.bcc).length <= 100, { path: ['to'], message: 'Máximo 100 destinatarios en total.' });
export type SentBody = { emailAccountId: string; to: string[]; cc: string[]; bcc: string[]; subject: string; body: string; sentAt: string };
export function sentBody(values: z.infer<typeof sentFormSchema>): SentBody {
  return { ...values, to: addresses(values.to), cc: addresses(values.cc), bcc: addresses(values.bcc), sentAt: new Date(values.sentAt).toISOString() };
}
export const receivedFormSchema = z.object({ sender: z.email('Indica un remitente externo válido.').max(254), to: addressField.refine(value => addresses(value).length > 0, 'Incluye al menos un destinatario Para.'), cc: addressField, bcc: addressField,
  subject: z.string().min(1, 'Indica el asunto.').max(998).refine(value => !!value.trim() && !/[\r\n\0]/.test(value), 'Revisa el asunto.'),
  body: z.string().min(1, 'Incluye el cuerpo original.').max(200000).refine(value => !!value.trim() && !value.includes('\0'), 'Revisa el cuerpo original.'),
  receivedAt: z.string().min(1, 'Indica la fecha real de recepción.').refine(value => Number.isFinite(+new Date(value)) && +new Date(value) <= Date.now(), 'Indica una fecha real válida que no sea futura.') })
  .refine(value => addresses(value.to).length + addresses(value.cc).length + addresses(value.bcc).length <= 100, { path: ['to'], message: 'Máximo 100 destinatarios en total.' });
export type ReceivedBody = { sender: string; to: string[]; cc: string[]; bcc: string[]; subject: string; body: string; receivedAt: string };
export function receivedBody(values: z.infer<typeof receivedFormSchema>): ReceivedBody { return { ...values, to: addresses(values.to), cc: addresses(values.cc), bcc: addresses(values.bcc), receivedAt: new Date(values.receivedAt).toISOString() }; }
