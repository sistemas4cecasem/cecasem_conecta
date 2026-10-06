import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DataImportError, type ImportErrorCode } from './import.errors';

const messages: Record<ImportErrorCode, string> = {
  INVALID_UPLOAD: 'Selecciona un archivo .xlsx válido y una asignación de columnas admitida.',
  FILE_TOO_LARGE: 'El archivo supera el límite permitido de 20 MiB.',
  INVALID_WORKBOOK: 'No se pudo interpretar el libro XLSX seleccionado.',
  WORKBOOK_LIMIT_EXCEEDED: 'El libro supera los límites de hojas, filas, columnas o contenido comprimido.',
  UNSUPPORTED_FORMULA: 'Las fórmulas no se ejecutan durante la importación.',
  FORBIDDEN: 'Solo una persona administradora activa puede ejecutar importaciones.',
  BATCH_NOT_FOUND: 'No se encontró el lote de importación.',
  BATCH_NOT_APPLICABLE: 'El lote no contiene filas válidas para aplicar.',
  BATCH_ALREADY_IMPORTED: 'Este lote ya se confirmó y no puede aplicarse de nuevo.',
  ROW_ERRORS: 'Resuelve las coincidencias pendientes antes de confirmar el lote.',
  DUPLICATE_MAPPING: 'Una columna del libro no puede asignarse a varios campos.',
};

@Catch(DataImportError)
export class ImportErrorFilter implements ExceptionFilter<DataImportError> {
  catch(error: DataImportError, host: ArgumentsHost) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'BATCH_NOT_FOUND' ? 404
      : error.code === 'BATCH_ALREADY_IMPORTED' || error.code === 'ROW_ERRORS' ? 409
        : error.code === 'FILE_TOO_LARGE' ? 413 : 400;
    const http = host.switchToHttp();
    http.getResponse<Response>().status(status).json({ statusCode: status, code: error.code, message: error.message !== error.code ? error.message : messages[error.code],
      path: http.getRequest<Request>().originalUrl.split('?')[0], timestamp: new Date().toISOString() });
  }
}
