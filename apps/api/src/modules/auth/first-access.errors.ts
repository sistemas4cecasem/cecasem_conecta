export const INVALID_FIRST_ACCESS_MESSAGE = 'El enlace o token de primer acceso no es válido o ya no está disponible.';
export class InvalidFirstAccessError extends Error {
  constructor() { super(INVALID_FIRST_ACCESS_MESSAGE); }
}
export class FirstAccessEmissionError extends Error {
  constructor(public readonly reason: 'FORBIDDEN' | 'NOT_FOUND' | 'INACTIVE' | 'PASSWORD_EXISTS') {
    super('No se puede emitir la credencial de primer acceso.');
  }
}
export class FirstAccessSessionConflictError extends Error {
  constructor() { super('Cierra la sesión abierta antes de completar el primer acceso.'); }
}
