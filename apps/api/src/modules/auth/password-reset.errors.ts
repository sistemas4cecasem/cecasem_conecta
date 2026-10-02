export const INVALID_PASSWORD_RESET_MESSAGE = 'El enlace o token de restablecimiento no es válido o ya no está disponible.';
export const REUSED_PASSWORD_MESSAGE = 'La nueva contraseña debe ser diferente de la contraseña actual.';
export class InvalidPasswordResetError extends Error {
  constructor() { super(INVALID_PASSWORD_RESET_MESSAGE); }
}
export class ReusedPasswordError extends Error {
  constructor() { super(REUSED_PASSWORD_MESSAGE); }
}
export class PasswordResetEmissionError extends Error {
  constructor(public readonly reason: 'FORBIDDEN' | 'NOT_FOUND' | 'INACTIVE' | 'FIRST_ACCESS_REQUIRED') {
    super('No se puede emitir la credencial de restablecimiento.');
  }
}
export class PasswordResetSessionConflictError extends Error {
  constructor() { super('Cierra la sesión abierta antes de restablecer la contraseña.'); }
}
