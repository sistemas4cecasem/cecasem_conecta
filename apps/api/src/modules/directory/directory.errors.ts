export type DirectoryErrorCode = 'FORBIDDEN' | 'INVALID_DIRECTORY' | 'ORGANIZATION_NOT_FOUND' | 'CATEGORY_NOT_FOUND' | 'CATEGORY_EXISTS' | 'CATEGORY_INACTIVE' | 'INVALID_HIERARCHY' | 'VERSION_CONFLICT';
export class DirectoryError extends Error {
  constructor(public readonly code: DirectoryErrorCode) { super(code); }
}
