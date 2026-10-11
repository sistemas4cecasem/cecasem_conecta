import type { ComponentProps, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { LoaderCircle } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ActionSize = 'small' | 'medium' | 'large';
type ActionPresentation = { variant?: ButtonVariant; size?: ActionSize; startIcon?: ReactNode; endIcon?: ReactNode };
export type ButtonProps = ComponentProps<'button'> & ActionPresentation & { pending?: boolean };

function ActionContents({ children, startIcon, endIcon, pending = false }: Pick<ActionPresentation, 'startIcon' | 'endIcon'> & { children?: ReactNode; pending?: boolean }) {
  return <>
    {pending ? <span className="ui-action-icon" aria-hidden="true"><LoaderCircle className="ui-action-spinner" /></span>
      : startIcon && <span className="ui-action-icon" aria-hidden="true">{startIcon}</span>}
    {children}
    {endIcon && <span className="ui-action-icon" aria-hidden="true">{endIcon}</span>}
  </>;
}

export function Button({ variant = 'secondary', size = 'medium', startIcon, endIcon, pending = false, type = 'button', className = '', children, ...props }: ButtonProps) {
  return <button {...props} type={type} aria-busy={pending || props['aria-busy'] || undefined}
    className={`ui-button ui-button-${variant} ui-action-${size} ${className}`}>
    <ActionContents startIcon={startIcon} endIcon={endIcon} pending={pending}>{children}</ActionContents>
  </button>;
}

export function IconButton({ label, icon, className = '', ...props }: Omit<ButtonProps, 'children' | 'aria-label' | 'startIcon' | 'endIcon'> & { label: string; icon: ReactNode }) {
  return <Button {...props} aria-label={label} startIcon={icon} className={`ui-button-icon-only ${className}`} />;
}

export function ActionLink({ appearance = 'normal', variant = 'secondary', size = 'medium', startIcon, endIcon, className = '', children, ...props }: LinkProps & ActionPresentation & {
  appearance?: 'normal' | 'action' | 'list' | 'context';
}) {
  const actionClass = appearance === 'action' ? `ui-button ui-link-action ui-button-${variant} ui-action-${size}` : `ui-link ui-link-${appearance}`;
  return <Link {...props} className={`${actionClass} ${className}`}>
    <ActionContents startIcon={startIcon} endIcon={endIcon}>{children}</ActionContents>
  </Link>;
}
