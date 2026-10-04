import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { FileError, type FileErrorCode } from './file-errors';
const messages: Record<FileErrorCode, string> = {
  INVALID_UPLOAD: 'Selecciona entre 1 y 10 archivos no vacíos con nombres válidos y una clave de solicitud UUID.',
  FILE_TOO_LARGE: 'Un archivo supera el límite permitido (máximo inicial: 20 MiB).',
  UNSUPPORTED_FILE: 'Un archivo no coincide con un tipo permitido. Revisa su extensión y contenido.',
  FORBIDDEN: 'No tienes permiso para acceder a los adjuntos de este recurso.', RESOURCE_NOT_FOUND: 'No se encontró el recurso.',
  OPPORTUNITY_CLOSED: 'La oportunidad está descartada o finalizada; no admite nuevos adjuntos.',
  RESOURCE_CLOSED: 'No se pueden incorporar adjuntos directamente a un proceso cerrado.', COMMUNICATION_INVALIDATED: 'No se pueden incorporar adjuntos a una comunicación invalidada.',
  FILE_NOT_FOUND: 'No se encontró el adjunto.', FILE_UNAVAILABLE: 'El archivo no está disponible o no superó la comprobación de integridad.', REQUEST_CONFLICT: 'Esta clave ya registró otra carga. Revisa los adjuntos antes de continuar.',
};
@Catch(FileError)
export class FileErrorFilter implements ExceptionFilter<FileError> {
  catch(error: FileError, host: ArgumentsHost) {
    const statusCode = error.code === 'FORBIDDEN' ? 403 : ['RESOURCE_NOT_FOUND', 'FILE_NOT_FOUND'].includes(error.code) ? 404 : error.code === 'FILE_UNAVAILABLE' ? 503 : error.code === 'FILE_TOO_LARGE' ? 413 : ['INVALID_UPLOAD', 'UNSUPPORTED_FILE'].includes(error.code) ? 400 : 409;
    const http = host.switchToHttp();
    http.getResponse<Response>().status(statusCode).json({ statusCode, code: error.code, message: messages[error.code], path: http.getRequest<Request>().originalUrl.split('?')[0], timestamp: new Date().toISOString() });
  }
}
