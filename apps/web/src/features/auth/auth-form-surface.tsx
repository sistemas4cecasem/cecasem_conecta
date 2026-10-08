import type { ReactNode } from 'react';
import { Surface } from '../../components/ui/layout';
import './auth.css';

export function AuthFormSurface({ title, titleId, description, children }: {
  title: string; titleId: string; description: string; children: ReactNode;
}) {
  return <Surface className="auth-form-surface" aria-labelledby={titleId}>
    <header><h1 id={titleId}>{title}</h1><p className="ui-description">{description}</p></header>
    {children}
  </Surface>;
}
