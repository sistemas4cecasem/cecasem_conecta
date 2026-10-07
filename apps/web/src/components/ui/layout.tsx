import { useId, type ComponentProps, type ReactNode } from 'react';

export interface PageHeaderProps {
  title: string; eyebrow?: string; description?: ReactNode; metadata?: ReactNode;
  primaryAction?: ReactNode; actions?: ReactNode;
}
export function PageHeader({ title, eyebrow, description, metadata, primaryAction, actions }: PageHeaderProps) {
  return <header className="ui-page-header"><div className="ui-page-heading">
    {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}<h1>{title}</h1>
    {description && <p className="ui-description">{description}</p>}{metadata}
  </div>{(primaryAction || actions) && <div className="ui-actions">{primaryAction}{actions}</div>}</header>;
}

export function Surface({ heading, description, actions, children, className = '', ...props }: ComponentProps<'section'> & {
  heading?: string; description?: ReactNode; actions?: ReactNode;
}) {
  const headingId = useId();
  return <section {...props} aria-labelledby={props['aria-labelledby'] ?? (heading ? headingId : undefined)} className={`ui-surface ${className}`}>
    {(heading || actions) && <header className="ui-section-heading">{heading && <h2 id={headingId}>{heading}</h2>}{actions}</header>}
    {description && <p className="ui-description">{description}</p>}{children}
  </section>;
}

// Contiene filtros existentes; no posee estado, parámetros URL ni consultas.
export function FilterBar({ actions, summary, children, ...props }: ComponentProps<'section'> & {
  actions?: ReactNode; summary?: ReactNode;
}) {
  return <Surface {...props} className={`ui-filter-bar ${props.className ?? ''}`}>
    <div className="ui-filter-controls">{children}</div>
    {(actions || summary) && <div className="ui-filter-footer">{summary}{actions}</div>}
  </Surface>;
}
