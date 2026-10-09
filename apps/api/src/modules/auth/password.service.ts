import { Injectable, OnModuleInit } from '@nestjs/common';
import { argon2id, hash, needsRehash, verify } from 'argon2';
import { randomBytes } from 'node:crypto';

export const PASSWORD_OPTIONS = { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;
export const normalizePassword = (password: string): string => password.normalize('NFC');
export const passwordLength = (password: string): number => [...normalizePassword(password)].length;
export const NEW_PASSWORD_MESSAGE = 'La contraseña debe tener entre 8 y 128 caracteres, una mayúscula, una minúscula y un símbolo.';
export const PASSWORD_REQUIREMENTS = {
  minimumLength: (password: string) => passwordLength(password) >= 8,
  uppercase: (password: string) => /\p{Lu}/u.test(normalizePassword(password)),
  lowercase: (password: string) => /\p{Ll}/u.test(normalizePassword(password)),
  symbol: (password: string) => /[\p{P}\p{S}]/u.test(normalizePassword(password)),
};
export function validNewPassword(password: unknown): password is string {
  return typeof password === 'string' && passwordLength(password) <= 128 &&
    PASSWORD_REQUIREMENTS.minimumLength(password) && PASSWORD_REQUIREMENTS.uppercase(password) &&
    PASSWORD_REQUIREMENTS.lowercase(password) && PASSWORD_REQUIREMENTS.symbol(password);
}
export class InvalidNewPasswordError extends Error {
  constructor() { super(NEW_PASSWORD_MESSAGE); }
}

export function validLoginPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length <= 256 && passwordLength(password) >= 1 && passwordLength(password) <= 128;
}

@Injectable()
export class PasswordService implements OnModuleInit {
  private referenceHash!: string;

  async onModuleInit(): Promise<void> {
    // Una sola vez por arranque; no pertenece a una cuenta y nunca habilita acceso.
    this.referenceHash = await hash(randomBytes(32), PASSWORD_OPTIONS);
  }

  hashNew(password: string): Promise<string> {
    if (!validNewPassword(password)) throw new InvalidNewPasswordError();
    return this.hashForRehash(password);
  }

  hashForRehash(password: string): Promise<string> {
    return hash(normalizePassword(password), PASSWORD_OPTIONS);
  }

  verify(password: string, storedHash: string | null): Promise<boolean> {
    return verify(storedHash ?? this.referenceHash, normalizePassword(password));
  }

  needsRehash(storedHash: string): boolean {
    return !storedHash.startsWith('$argon2id$') || needsRehash(storedHash, PASSWORD_OPTIONS);
  }
}
