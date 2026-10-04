import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AmendmentError } from './communication-amendment.rules';
@Catch(AmendmentError)
export class AmendmentErrorFilter implements ExceptionFilter {
  catch(error: AmendmentError, host: ArgumentsHost) {
    const statusCode = error.code === 'INVALID_AMENDMENT' ? 400 : error.code === 'FORBIDDEN' ? 403 : error.code === 'COMMUNICATION_NOT_FOUND' ? 404 : 409;
    const messages = { INVALID_AMENDMENT: 'Incluye contenido significativo de hasta 5000 caracteres y una clave de solicitud válida.', FORBIDDEN: 'No tienes permiso para realizar esta acción sobre la comunicación.',
      COMMUNICATION_NOT_FOUND: 'No se encontró la comunicación.', REQUEST_CONFLICT: 'La clave de solicitud corresponde a otro contenido.', ALREADY_INVALIDATED: 'La comunicación ya está invalidada. Puedes agregar una observación posterior.' };
    const http = host.switchToHttp(); http.getResponse<Response>().status(statusCode).json({ statusCode, code: error.code, message: messages[error.code], path: http.getRequest<Request>().originalUrl.split('?')[0], timestamp: new Date().toISOString() });
  }
}
