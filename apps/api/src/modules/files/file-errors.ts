export type FileErrorCode = 'INVALID_UPLOAD' | 'FILE_TOO_LARGE' | 'UNSUPPORTED_FILE' | 'FORBIDDEN' | 'RESOURCE_NOT_FOUND' | 'RESOURCE_CLOSED' | 'MEETING_CANCELLED' | 'OPPORTUNITY_CLOSED' | 'COMMUNICATION_INVALIDATED' | 'FILE_NOT_FOUND' | 'FILE_UNAVAILABLE' | 'REQUEST_CONFLICT';
export class FileError extends Error {
  constructor(public readonly code: FileErrorCode) { super(code); }
}
