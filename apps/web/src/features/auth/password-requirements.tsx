import type { ReactNode } from 'react';

const normalized = (value: string) => value.normalize('NFC');
const length = (value: string) => [...normalized(value)].length;

export function PasswordRequirements({ password }: { password: string }): ReactNode {
  const value = normalized(password);
  const requirements = [
    ['minimum-length', 'Al menos 8 caracteres', length(value) >= 8],
    ['uppercase', 'Al menos una mayúscula', /\p{Lu}/u.test(value)],
    ['lowercase', 'Al menos una minúscula', /\p{Ll}/u.test(value)],
    ['symbol', 'Al menos un símbolo', /[\p{P}\p{S}]/u.test(value)],
  ] as const;
  return <ul className="password-requirements" aria-label="Requisitos de contraseña">
    {requirements.map(([key, label, satisfied]) => <li key={key} className={satisfied ? 'is-satisfied' : ''}>
      <span aria-hidden="true">{satisfied ? '✓' : '○'}</span> {label}
    </li>)}
  </ul>;
}
