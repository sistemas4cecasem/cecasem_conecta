export class InvalidIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidIdentityError';
  }
}

export class IdentityConflictError extends Error {
  constructor(public readonly code: 'EMAIL_EXISTS' | 'USERNAME_EXHAUSTED' | 'ACCOUNT_EXISTS' | 'ASSIGNMENT_EXISTS') {
    super('La identidad o asociación solicitada entra en conflicto con información existente.');
    this.name = 'IdentityConflictError';
  }
}
