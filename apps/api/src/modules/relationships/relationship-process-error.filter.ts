import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProcessError, type ProcessErrorCode } from './relationship-process.rules';
const messages: Record<ProcessErrorCode, string> = {
  FORBIDDEN: 'No tienes permiso para realizar esta acción sobre el proceso.',
  INVALID_PROCESS: 'Revisa el propósito, el actor, el estado y los datos de cierre o reapertura.',
  PROCESS_NOT_FOUND: 'No se encontró el proceso.',
  PROCESS_TARGET_UNAVAILABLE: 'Selecciona una ficha activa sin consolidar. Si la persona tiene un vínculo vigente, selecciona su organización.',
  VERSION_CONFLICT: 'El proceso cambió. Recarga y revisa su estado antes de continuar.',
  INVALID_TRANSITION: 'Este cambio de estado no está permitido. El cierre y la reapertura requieren su acción específica.',
  PROCESS_ALREADY_CLOSED: 'El proceso ya está cerrado.',
  PROCESS_NOT_CLOSED: 'Solo puede reabrirse un proceso cerrado.',
};
@Catch(ProcessError)
export class ProcessErrorFilter implements ExceptionFilter {
  catch(error: ProcessError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const statusCode = error.code === 'FORBIDDEN' ? 403 : error.code === 'INVALID_PROCESS' ? 400 : error.code === 'PROCESS_NOT_FOUND' ? 404 : 409;
    http.getResponse<Response>().status(statusCode).json({ statusCode, code: error.code, message: messages[error.code],
      path: http.getRequest<Request>().originalUrl.split('?')[0], timestamp: new Date().toISOString() });
  }
}
