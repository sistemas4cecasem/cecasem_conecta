import { z } from 'zod';

export const roles = ['ADMINISTRATOR', 'BOARD', 'RESEARCH', 'PLANNING'] as const;
export const roleLabels = { ADMINISTRATOR: 'Administrador', BOARD: 'Directorio', RESEARCH: 'Búsqueda', PLANNING: 'Planificación' };
export const userSchema = z.object({ id: z.string(), givenNames: z.string(), familyNames: z.string(), username: z.string(),
  email: z.string(), role: z.enum(roles), isActive: z.boolean(), createdAt: z.string(), deactivatedAt: z.string().nullable(),
  credentialStatus: z.enum(['PENDING_FIRST_ACCESS', 'ESTABLISHED']) });
export type AdministrativeUser = z.infer<typeof userSchema>;
export const mailboxSchema = z.object({ id: z.string(), address: z.string(), displayName: z.string(), provider: z.string().nullable(), isActive: z.boolean() });
export type Mailbox = z.infer<typeof mailboxSchema>;
const text = z.string().trim().min(1, 'Completa este campo.').max(150, 'El máximo es 150 caracteres.');
const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Introduce un correo válido.'));
export const createUserSchema = z.object({ givenNames: text, familyNames: text, email, role: z.enum(roles) });
export const createMailboxSchema = z.object({ displayName: text, address: email, provider: z.string().trim().max(150) });
