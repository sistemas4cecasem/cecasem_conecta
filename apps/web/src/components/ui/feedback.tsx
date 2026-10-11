import type { ComponentProps, ReactNode } from 'react';
import { Button } from './actions';
import { iconCatalog } from './icons';

export type FeedbackTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export function StatusBadge({ children, tone = 'neutral' }: { children: string; tone?: FeedbackTone }) {
  return <span className={`ui-badge ui-tone-${tone}`}>{children}</span>;
}
export function Alert({ tone = 'info', title, actions, children, className = '', ...props }: Omit<ComponentProps<'div'>, 'title'> & {
  tone?: FeedbackTone; title?: string; actions?: ReactNode;
}) {
  const Icon = iconCatalog.feedback[tone];
  return <div {...props} className={`ui-alert ui-tone-${tone} ${className}`}>
    <Icon className="ui-alert-icon" size={18} strokeWidth={1.9} aria-hidden="true" />
    <div className="ui-alert-content">{title && <p className="ui-alert-title">{title}</p>}<div>{children}</div>{actions && <div className="ui-actions">{actions}</div>}</div>
  </div>;
}
export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  const Icon = iconCatalog.feedback.empty;
  return <div className="ui-empty"><Icon className="ui-empty-icon" size={22} strokeWidth={1.7} aria-hidden="true" />
    <div><p className="ui-empty-title">{title}</p>{description && <p className="ui-description">{description}</p>}{action}</div>
  </div>;
}
export function QueryFeedback({ pending, pendingMessage = 'Cargando…', error, errorMessage = 'No se pudo cargar la información.', retry }: {
  pending: boolean; pendingMessage?: string; error: boolean; errorMessage?: string; retry?: () => unknown;
}) {
  if (pending) { const Icon = iconCatalog.feedback.loading; return <p role="status" className="ui-loading"><Icon size={18} className="ui-action-spinner" aria-hidden="true" />{pendingMessage}</p>; }
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
