import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CommunicationError } from './communication.rules';
@Catch(CommunicationError)
export class CommunicationErrorFilter implements ExceptionFilter {
  catch(error: CommunicationError, host: ArgumentsHost): void {
    const statusCode = error.code === 'FORBIDDEN' ? 403 : error.code === 'INVALID_COMMUNICATION' ? 400 : error.code === 'COMMUNICATION_NOT_FOUND' ? 404 : 409;
    const messages = { FORBIDDEN: 'No tienes permiso para registrar o consultar comunicaciones.', INVALID_COMMUNICATION: 'Revisa cuenta, destinatarios, asunto, cuerpo y fecha real de envío. Incluye una clave de solicitud válida.',
      MAILBOX_UNAVAILABLE: 'La cuenta no está habilitada y asignada a tu usuario. Recarga tus cuentas disponibles.', PROCESS_CLOSED: 'El proceso está cerrado. Debe reabrirse mediante la acción autorizada antes de registrar otra comunicación.',
      COMMUNICATION_NOT_FOUND: 'No se encontró la comunicación.', REQUEST_CONFLICT: 'Esta clave de solicitud ya registró otro contenido. Revisa la comunicación existente antes de continuar.' };
    const http = host.switchToHttp();
    http.getResponse<Response>().status(statusCode).json({ statusCode, code: error.code, message: messages[error.code], path: http.getRequest<Request>().originalUrl.split('?')[0], timestamp: new Date().toISOString() });
  }
}
