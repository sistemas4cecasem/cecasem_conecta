import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { OpportunityError, type OpportunityErrorCode } from './opportunity.rules';
const messages: Record<OpportunityErrorCode, string> = {
  INVALID_OPPORTUNITY: 'Revisa los datos, las organizaciones y la fecha límite de la oportunidad.',
  INVALID_OPPORTUNITY_ORIGIN: 'El origen no existe o la comunicación no corresponde al proceso seleccionado.',
  OPPORTUNITY_ORGANIZATION_UNAVAILABLE: 'Una organización seleccionada ya no está disponible. Revisa el Directorio.',
  OPPORTUNITY_NOT_FOUND: 'No se encontró la oportunidad.', INVALID_OPPORTUNITY_TRANSITION: 'Este cambio de estado no está permitido. Recarga la oportunidad.',
  VERSION_CONFLICT: 'La oportunidad cambió desde que la abriste. Recarga y revisa tus cambios.', REQUEST_CONFLICT: 'Esta solicitud ya creó otra oportunidad. Revisa los datos antes de continuar.',
  FORBIDDEN: 'No tienes permiso para realizar esta acción sobre oportunidades.', INVALID_OPPORTUNITY_CURSOR: 'No se pudo continuar el historial. Vuelve a cargarlo.',
};
@Catch(OpportunityError)
export class OpportunityErrorFilter implements ExceptionFilter<OpportunityError> {
  catch(error: OpportunityError, host: ArgumentsHost) {
    const statusCode = error.code === 'FORBIDDEN' ? 403 : error.code === 'OPPORTUNITY_NOT_FOUND' ? 404 : ['VERSION_CONFLICT', 'REQUEST_CONFLICT', 'INVALID_OPPORTUNITY_TRANSITION'].includes(error.code) ? 409 : 400;
    const http = host.switchToHttp();
    http.getResponse<Response>().status(statusCode).json({ statusCode, code: error.code, message: messages[error.code], path: http.getRequest<Request>().originalUrl.split('?')[0], timestamp: new Date().toISOString() });
  }
}
