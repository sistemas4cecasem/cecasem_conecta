import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

function httpMessage(exception: HttpException): string | string[] {
  const payload = exception.getResponse();
  if (typeof payload === 'string') {
    return payload;
  }

  if ('message' in payload) {
    const message: unknown = payload.message;
    if (typeof message === 'string') {
      return message;
    }
    if (
      Array.isArray(message) &&
      message.every((item: unknown) => typeof item === 'string')
    ) {
      return message;
    }
  }

  return exception.message;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const isServerError = statusCode >= 500;
    if (isServerError) {
      // Do not log the exception message/body: either may contain sensitive data.
      this.logger.error('Fallo interno de la API; respuesta HTTP 500 o superior.');
    }

    const message =
      !isServerError && exception instanceof HttpException
        ? httpMessage(exception)
        : 'Error interno del servidor.';

    response.status(statusCode).json({
      statusCode,
      message,
      path: request.originalUrl.split('?')[0],
      timestamp: new Date().toISOString(),
    });
  }
}
