import { InvalidIdentityError } from './identity.errors';

export const USERNAME_MAX_LENGTH = 64;
export const USERNAME_MAX_ATTEMPTS = 100;
const COMPONENT_MAX_LENGTH = 30; // 30 + punto + 30 + sufijo de hasta 3 dígitos.

function firstComponent(value: string): string {
  const component = value.normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’ʼ]/gu, '')
    .match(/[a-z0-9]+/u)?.[0];
  if (!component) {
    throw new InvalidIdentityError('Los nombres y apellidos deben contener un componente válido para el username.');
  }
  return component.slice(0, COMPONENT_MAX_LENGTH);
}

export function generateUsername(givenNames: string, familyNames: string, attempt = 1): string {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > USERNAME_MAX_ATTEMPTS) {
    throw new InvalidIdentityError('El intento de generación de username está fuera del límite.');
  }
  const base = `${firstComponent(givenNames)}.${firstComponent(familyNames)}`;
  return attempt === 1 ? base : `${base}${attempt}`;
}
