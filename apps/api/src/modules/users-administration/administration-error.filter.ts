import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdministrationError } from '../users/administration.errors';
import { IdentityConflictError, InvalidIdentityError } from '../users/identity.errors';

const messages = {
  FORBIDDEN: 'No tiene los permisos necesarios.', USER_NOT_FOUND: 'No se encontró el usuario.',
  ACCOUNT_NOT_FOUND: 'No se encontró el buzón.', ACCOUNT_INACTIVE: 'El buzón está inactivo.',
  LAST_ADMINISTRATOR: 'Debe permanecer al menos un Administrador activo.',
  BOOTSTRAP_UNAVAILABLE: 'El aprovisionamiento inicial ya no está disponible.', BOOTSTRAP_BUSY: 'El aprovisionamiento inicial está en curso.',
  EMAIL_EXISTS: 'El correo ya está registrado.', USERNAME_EXHAUSTED: 'No se pudo generar un nombre de usuario disponible.',
  ACCOUNT_EXISTS: 'El buzón ya está registrado.', ASSIGNMENT_EXISTS: 'El buzón ya está asignado.',
};

@Catch(AdministrationError, IdentityConflictError, InvalidIdentityError)
export class AdministrationErrorFilter implements ExceptionFilter {
  catch(error: AdministrationError | IdentityConflictError | InvalidIdentityError, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const code = error instanceof InvalidIdentityError ? 'INVALID_IDENTITY' : error.code;
    const statusCode = code === 'INVALID_IDENTITY' ? 400 : code === 'FORBIDDEN' ? 403 :
      code === 'USER_NOT_FOUND' || code === 'ACCOUNT_NOT_FOUND' ? 404 : 409;
    http.getResponse<Response>().status(statusCode).json({ statusCode, code,
      message: error instanceof InvalidIdentityError ? error.message : messages[error.code],
      path: http.getRequest<Request>().originalUrl.split('?')[0], timestamp: new Date().toISOString() });
  }
}
