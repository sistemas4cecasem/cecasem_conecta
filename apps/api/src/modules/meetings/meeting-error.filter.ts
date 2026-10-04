import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { MeetingError, type MeetingErrorCode } from './meeting.rules';
export const MEETING_ERRORS:Record<MeetingErrorCode,string>={
 INVALID_MEETING:'Revisa los datos de la reunión y la información disponible de sus participantes.',
 MEETING_NOT_FOUND:'No se encontró la reunión.', INVALID_MEETING_ORIGIN:'Selecciona un proceso u oportunidad existente y vínculos coherentes.',
 INVALID_TIMEZONE:'Indica una zona horaria IANA válida, por ejemplo America/La_Paz.',
 NONEXISTENT_LOCAL_TIME:'Esta hora local no existe por un cambio de horario. Elige otra hora.',
 AMBIGUOUS_LOCAL_TIME:'Esta hora local ocurre dos veces. Selecciona la primera o segunda ocurrencia.',
 MEETING_REFERENCE_UNAVAILABLE:'La ficha o participante seleccionado ya no está disponible. Revisa la selección.',
 DUPLICATE_PARTICIPANT:'Ese usuario o persona ya participa en esta reunión.',
 MEETING_STATE_CONFLICT:'El estado o la fecha de la reunión no permite esta acción. Revisa sus datos actuales.',
 VERSION_CONFLICT:'Otra persona cambió la reunión. Recarga y revisa los cambios antes de reintentar.',
 REQUEST_CONFLICT:'Esta clave ya registró otro comando. Revisa el resultado antes de iniciar otro intento.',
 FORBIDDEN:'No tienes permiso para esta reunión o sus recursos vinculados.',
};
@Catch(MeetingError)
export class MeetingErrorFilter implements ExceptionFilter<MeetingError>{
 catch(error:MeetingError,host:ArgumentsHost){
  const statusCode=error.code==='FORBIDDEN'?403:error.code==='MEETING_NOT_FOUND'?404:['INVALID_MEETING','INVALID_MEETING_ORIGIN','INVALID_TIMEZONE','NONEXISTENT_LOCAL_TIME','AMBIGUOUS_LOCAL_TIME'].includes(error.code)?400:409;
  const http=host.switchToHttp();http.getResponse<Response>().status(statusCode).json({statusCode,code:error.code,message:MEETING_ERRORS[error.code],path:http.getRequest<Request>().originalUrl.split('?')[0],timestamp:new Date().toISOString()});
 }
}
