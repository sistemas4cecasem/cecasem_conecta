import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TimelineError } from './timeline.rules';
@Catch(TimelineError)
export class TimelineErrorFilter implements ExceptionFilter {
  catch(error: TimelineError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    http.getResponse<Response>().status(400).json({ statusCode: 400, code: error.code,
      message: error.code === 'INVALID_INTERNAL_NOTE' ? 'Incluye una nota interna de hasta 5000 caracteres.' : 'El cursor del historial no es válido. Actualiza el historial.',
      path: http.getRequest<Request>().originalUrl.split('?')[0], timestamp: new Date().toISOString() });
  }
}
