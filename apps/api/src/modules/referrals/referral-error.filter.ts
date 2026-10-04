import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ReferralError, type ReferralErrorCode } from './referral.rules';
const messages: Record<ReferralErrorCode, string> = {
  INVALID_REFERRAL: 'Incluye un nombre, una organización o un medio recomendado válido. Revisa los datos disponibles.',
  REFERRAL_NOT_FOUND: 'No se encontró el contacto recomendado.',
  REFERRAL_REFERENCE_UNAVAILABLE: 'Una ficha seleccionada cambió o el medio no corresponde. Revisa el Directorio y vuelve a seleccionar.',
  REFERRAL_SOURCE_INVALIDATED: 'La comunicación fue invalidada. Sus recomendaciones previas se conservan, pero no admite nuevos registros.',
  REQUEST_CONFLICT: 'Este intento ya registró datos diferentes. Revisa el resultado antes de iniciar un nuevo registro.',
  FORBIDDEN: 'No tienes permiso para consultar o registrar contactos recomendados.',
};
@Catch(ReferralError)
export class ReferralErrorFilter implements ExceptionFilter<ReferralError> {
  catch(error: ReferralError, host: ArgumentsHost) {
    const statusCode = error.code === 'FORBIDDEN' ? 403 : error.code === 'REFERRAL_NOT_FOUND' ? 404 : ['REQUEST_CONFLICT', 'REFERRAL_REFERENCE_UNAVAILABLE', 'REFERRAL_SOURCE_INVALIDATED'].includes(error.code) ? 409 : 400;
    const http = host.switchToHttp();
    http.getResponse<Response>().status(statusCode).json({ statusCode, code: error.code, message: messages[error.code], path: http.getRequest<Request>().originalUrl.split('?')[0], timestamp: new Date().toISOString() });
  }
}
