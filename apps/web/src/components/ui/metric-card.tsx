import type { ReactNode } from 'react';
import { Link } from 'react-router';

export interface MetricCardProps {
  label: string;
  value: number | string;
  description?: string;
  context?: ReactNode;
  to?: string;
}

export function MetricCard({ label, value, description, context, to }: MetricCardProps) {
  const content = <>
    <span className="ui-metric-label">{label}</span>{' '}
    <span className="ui-metric-value">{value}</span>
    {description && <>{' '}<span className="ui-metric-description">{description}</span></>}
    {context && <>{' '}<span className="ui-metric-context">{context}</span></>}
  </>;
  return to === undefined ? <div className="ui-metric">{content}</div>
    : <Link to={to} className="ui-metric ui-metric-link">{content}</Link>;
}
