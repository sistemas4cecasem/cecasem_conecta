import type { ComponentProps, ReactNode } from 'react';
import { Button } from './actions';

export type FeedbackTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export function StatusBadge({ children, tone = 'neutral' }: { children: string; tone?: FeedbackTone }) {
  return <span className={`ui-badge ui-tone-${tone}`}>{children}</span>;
}
export function Alert({ tone = 'info', title, actions, children, className = '', ...props }: Omit<ComponentProps<'div'>, 'title'> & {
  tone?: FeedbackTone; title?: string; actions?: ReactNode;
}) {
  return <div {...props} className={`ui-alert ui-tone-${tone} ${className}`}>
    {title && <p className="ui-alert-title">{title}</p>}<div>{children}</div>{actions && <div className="ui-actions">{actions}</div>}
  </div>;
}
export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return <div className="ui-empty"><p className="ui-empty-title">{title}</p>{description && <p className="ui-description">{description}</p>}{action}</div>;
}
export function QueryFeedback({ pending, error, errorMessage = 'No se pudo cargar la información.', retry }: {
  pending: boolean; error: boolean; errorMessage?: string; retry?: () => unknown;
}) {
  if (pending) return <p role="status" className="ui-loading">Cargando…</p>;
  if (error) return <Alert tone="danger" role="alert" actions={retry && <Button onClick={() => void retry()}>Reintentar</Button>}>{errorMessage}</Alert>;
  return null;
}
export function ConfirmationPanel({ title, tone = 'warning', actions, children, ...props }: ComponentProps<'section'> & {
  title: string; tone?: 'warning' | 'danger'; actions?: ReactNode;
}) {
  return <section {...props} aria-label={props['aria-label'] ?? title} className={`ui-confirmation ui-tone-${tone} ${props.className ?? ''}`}>
    <h2>{title}</h2>{children}{actions && <div className="ui-actions">{actions}</div>}
  </section>;
}
