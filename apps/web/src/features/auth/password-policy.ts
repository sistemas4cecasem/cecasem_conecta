const normalized = (value: string) => value.normalize('NFC');
const length = (value: string) => [...normalized(value)].length;

export const NEW_PASSWORD_MESSAGE = 'La contraseña debe tener entre 8 y 128 caracteres, una mayúscula, una minúscula y un símbolo.';

export function validNewPassword(value: string): boolean {
  const password = normalized(value);
  return length(password) >= 8 && length(password) <= 128 && /\p{Lu}/u.test(password) &&
    /\p{Ll}/u.test(password) && /[\p{P}\p{S}]/u.test(password);
}
