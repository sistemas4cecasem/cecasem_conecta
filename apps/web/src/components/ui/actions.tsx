import type { ComponentProps } from 'react';
import { Link, type LinkProps } from 'react-router';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonProps = ComponentProps<'button'> & { variant?: ButtonVariant; pending?: boolean };

export function Button({ variant = 'secondary', pending = false, type = 'button', className = '', ...props }: ButtonProps) {
  return <button {...props} type={type} aria-busy={pending || props['aria-busy'] || undefined}
    className={`ui-button ui-button-${variant} ${className}`} />;
}

export function ActionLink({ appearance = 'normal', className = '', ...props }: LinkProps & {
  appearance?: 'normal' | 'action' | 'list' | 'context';
}) {
  return <Link {...props} className={`ui-link ui-link-${appearance} ${className}`} />;
}
