import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ContextError } from './relationship-context.rules';
@Catch(ContextError)
export class ContextErrorFilter implements ExceptionFilter {
  catch(error: ContextError, host: ArgumentsHost): void {
    const statusCode = error.code === 'FORBIDDEN' ? 403 : error.code === 'CONTEXT_TARGET_NOT_FOUND' ? 404 : 400;
    const messages = { FORBIDDEN: 'No tienes permiso para consultar el contexto institucional.',
      CONTEXT_TARGET_NOT_FOUND: 'No se encontró el objetivo del Directorio.', INVALID_CONTEXT_TARGET: 'Selecciona exactamente una organización o una persona.' };
    const http = host.switchToHttp();
    http.getResponse<Response>().status(statusCode).json({ statusCode, code: error.code, message: messages[error.code],
      path: http.getRequest<Request>().originalUrl.split('?')[0], timestamp: new Date().toISOString() });
  }
}
