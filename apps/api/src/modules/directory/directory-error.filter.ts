import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DirectoryError } from './directory.errors';
const messages = {
  FORBIDDEN: 'No tiene los permisos necesarios.', INVALID_DIRECTORY: 'Revise los datos de la ficha.',
  PERSON_NOT_FOUND: 'No se encontró la persona.', PERSON_RELATION_NOT_FOUND: 'No se encontró el vínculo institucional.',
  ORGANIZATION_NOT_FOUND: 'No se encontró la organización.', CATEGORY_NOT_FOUND: 'No se encontró la categoría.',
  CATEGORY_EXISTS: 'Ya existe una categoría con ese nombre.', CATEGORY_INACTIVE: 'No puede asignar una categoría inactiva.',
  INVALID_HIERARCHY: 'La relación matriz/sede produciría un ciclo.',
  VERSION_CONFLICT: 'La ficha cambió desde que la abrió. Recargue y revise sus cambios.',
  CONTACT_METHOD_NOT_FOUND: 'No se encontró el medio de contacto.', CONTACT_ASSOCIATION_NOT_FOUND: 'No se encontró la asociación de contacto.',
  CONTACT_EMAIL_EXISTS: 'Este correo ya está registrado. Consulte su ficha y confirme si desea asociarlo.',
  CONTACT_VALUE_EXISTS: 'El correo corregido ya pertenece a otro medio. Puede sustituir explícitamente una asociación usando ese medio.',
  SHARED_CONTACT_CONFIRMATION_REQUIRED: 'Confirme la corrección global del medio compartido después de revisar sus asociaciones.',
  CONTACT_UNUSABLE: 'El medio está marcado como no utilizable. Consulte sus antecedentes; un Administrador puede cambiar su condición.',
  INVALID_CONTACT_REPLACEMENT: 'Seleccione un medio diferente y confirme la sustitución de esta asociación.',
};
@Catch(DirectoryError)
export class DirectoryErrorFilter implements ExceptionFilter {
  catch(error: DirectoryError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const statusCode = error.code === 'FORBIDDEN' ? 403 : error.code === 'INVALID_DIRECTORY' ? 400 :
      error.code.endsWith('_NOT_FOUND') ? 404 : 409;
    http.getResponse<Response>().status(statusCode).json({ statusCode, code: error.code, message: messages[error.code],
      ...(error.details ? { details: error.details } : {}), path: http.getRequest<Request>().originalUrl.split('?')[0], timestamp: new Date().toISOString() });
  }
}
