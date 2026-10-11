import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { iconCatalog } from './icons';

export interface MetricCardProps {
  label: string;
  value: number | string;
  description?: string;
  context?: ReactNode;
  icon?: ReactNode;
  to?: string;
}

const OpenIcon = iconCatalog.action.open;

export function MetricCard({ label, value, description, context, icon, to }: MetricCardProps) {
  const content = <>
    <span className="ui-metric-heading"><span className="ui-metric-label">{label}</span>{icon && <span className="ui-metric-icon" aria-hidden="true">{icon}</span>}</span>{' '}
    <span className="ui-metric-value">{value}</span>
    {description && <>{' '}<span className="ui-metric-description">{description}</span></>}
    {context && <>{' '}<span className="ui-metric-context">{context}</span></>}
    {to && <span className="ui-metric-open" aria-hidden="true"><OpenIcon size={17} strokeWidth={1.8} /></span>}
  </>;
  return to === undefined ? <div className="ui-metric">{content}</div>
    : <Link to={to} className="ui-metric ui-metric-link">{content}</Link>;
}
