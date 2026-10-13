import type { ComponentProps, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { ArrowLeft, ArrowUpRight, ChevronRight, LoaderCircle } from 'lucide-react';

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

export function ActionLink({ appearance = 'reference', variant = 'secondary', size = 'medium', startIcon, endIcon, className = '', children, ...props }: LinkProps & ActionPresentation & {
  appearance?: 'normal' | 'action' | 'list' | 'context' | 'reference' | 'back';
}) {
  const actionClass = appearance === 'action' ? `ui-button ui-link-action ui-button-${variant} ui-action-${size}` : `ui-link ui-link-${appearance}`;
  return <Link {...props} className={`${actionClass} ${className}`}>
    <ActionContents startIcon={startIcon ?? (appearance === 'back' ? <ArrowLeft /> : undefined)}
      endIcon={endIcon ?? (appearance === 'list' ? <ChevronRight /> : ['context', 'reference'].includes(appearance) ? <ArrowUpRight /> : undefined)}>{children}</ActionContents>
  </Link>;
}

export function ExternalLink({ children, className = '', ...props }: ComponentProps<'a'>) {
  return <a {...props} aria-description={props['aria-description'] ?? (props.target === '_blank' ? 'Abre en otra pestaña' : undefined)} className={`ui-link ui-link-external ${className}`}>
    {children}<span className="ui-action-icon" aria-hidden="true"><ArrowUpRight /></span>
  </a>;
}
