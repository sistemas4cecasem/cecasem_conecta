export type AdministrationErrorCode = 'FORBIDDEN' | 'USER_NOT_FOUND' | 'ACCOUNT_NOT_FOUND' | 'ACCOUNT_INACTIVE' | 'LAST_ADMINISTRATOR' | 'BOOTSTRAP_UNAVAILABLE' | 'BOOTSTRAP_BUSY';

export class AdministrationError extends Error {
  constructor(public readonly code: AdministrationErrorCode) {
    super(code);
    this.name = 'AdministrationError';
  }
}
