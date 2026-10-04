import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RestrictionError } from './contact-restriction.rules';
const messages = {
  FORBIDDEN: 'No tienes permiso para realizar esta acción sobre la restricción.',
  INVALID_RESTRICTION: 'Indica exactamente un objetivo y un motivo válido de hasta 5000 caracteres.',
  RESTRICTION_NOT_FOUND: 'No se encontró la restricción.',
  RESTRICTION_TARGET_UNAVAILABLE: 'Selecciona una ficha activa sin consolidar; para una persona con vínculo vigente, utiliza su organización.',
  CONTACT_RESTRICTED: 'RESTRICCIÓN ACTIVA — NO CONTACTAR. No se puede iniciar este acercamiento. Revisa la restricción institucional.',
  RESTRICTION_ALREADY_ACTIVE: 'Este objetivo ya tiene una restricción activa. Revisa su historial.',
  RESTRICTION_ALREADY_LIFTED: 'La restricción ya fue levantada. Recarga y revisa su historial.',
  VERSION_CONFLICT: 'La restricción cambió. Recarga y revisa su estado antes de continuar.',
};
@Catch(RestrictionError)
export class RestrictionErrorFilter implements ExceptionFilter {
  catch(error: RestrictionError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const statusCode = error.code === 'FORBIDDEN' ? 403 : error.code === 'INVALID_RESTRICTION' ? 400 : error.code === 'RESTRICTION_NOT_FOUND' ? 404 : 409;
    http.getResponse<Response>().status(statusCode).json({ statusCode, code: error.code, message: messages[error.code],
      path: http.getRequest<Request>().originalUrl.split('?')[0], timestamp: new Date().toISOString() });
  }
}
