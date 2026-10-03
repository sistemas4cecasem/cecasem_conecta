import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { IntentError } from './contact-intent.rules';
const messages = {
  FORBIDDEN: 'No tienes permiso para realizar esta acción sobre la intención.',
  INVALID_INTENT: 'Indica un propósito válido y exactamente una organización o persona independiente.',
  INTENT_NOT_FOUND: 'No se encontró la intención.',
  INTENT_TARGET_UNAVAILABLE: 'Selecciona una ficha activa sin consolidar. Si la persona tiene un vínculo vigente, selecciona su organización.',
  VERSION_CONFLICT: 'La intención cambió. Recarga y revisa su estado antes de continuar.',
  INTENT_NOT_ACTIVE: 'Solo puede cancelarse una intención activa.',
};
@Catch(IntentError)
export class IntentErrorFilter implements ExceptionFilter {
  catch(error: IntentError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const statusCode = error.code === 'FORBIDDEN' ? 403 : error.code === 'INVALID_INTENT' ? 400 : error.code === 'INTENT_NOT_FOUND' ? 404 : 409;
    http.getResponse<Response>().status(statusCode).json({ statusCode, code: error.code, message: messages[error.code],
      path: http.getRequest<Request>().originalUrl.split('?')[0], timestamp: new Date().toISOString() });
  }
}
