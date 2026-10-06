export type ImportErrorCode = 'INVALID_UPLOAD' | 'FILE_TOO_LARGE' | 'INVALID_WORKBOOK' | 'WORKBOOK_LIMIT_EXCEEDED' | 'UNSUPPORTED_FORMULA' | 'FORBIDDEN' | 'BATCH_NOT_FOUND' | 'BATCH_NOT_APPLICABLE' | 'BATCH_ALREADY_IMPORTED' | 'ROW_ERRORS' | 'DUPLICATE_MAPPING';

export class DataImportError extends Error {
  constructor(public readonly code: ImportErrorCode, message?: string) {
    super(message ?? code);
  }
}
