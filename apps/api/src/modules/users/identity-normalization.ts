import { isEmail } from 'class-validator';
import { InvalidIdentityError } from './identity.errors';

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !isEmail(email)) {
    throw new InvalidIdentityError('La dirección de correo no es válida.');
  }
  return email;
}

export function normalizeIdentityText(value: string, label: string): string {
  const text = value.trim().replace(/\s+/gu, ' ');
  if (!text || text.length > 150) {
    throw new InvalidIdentityError(`${label} debe contener entre 1 y 150 caracteres.`);
  }
  return text;
}
