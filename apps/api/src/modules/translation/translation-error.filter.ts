import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { TranslationError } from './translation-provider';
@Catch(TranslationError)
export class TranslationErrorFilter implements ExceptionFilter {
  catch(error: TranslationError, host: ArgumentsHost) {
    const status = error.code === 'TRANSLATION_EMPTY_BODY' ? 422 : error.code === 'TRANSLATION_TIMEOUT' ? 504 : 503;
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, code: error.code,
      message: 'No se pudo generar la traducción. El original continúa disponible.' });
  }
}
