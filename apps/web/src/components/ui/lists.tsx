import type { ComponentProps, ReactNode } from 'react';
import { Button, type ButtonProps } from './actions';

export function DataList({ className = '', variant = 'records', columns = 1, ...props }: ComponentProps<'ul'> & {
  variant?: 'records' | 'compact'; columns?: 1 | 2;
}) {
  return <ul {...props} className={`ui-data-list ui-data-list-${variant} ui-data-list-columns-${columns} ${className}`} />;
}
export function DataListItem({ className = '', ...props }: ComponentProps<'li'>) {
  return <li {...props} className={`ui-data-list-item ${className}`} />;
}
export function Metadata({ items, layout = 'inline' }: { items: readonly { label: string; value: ReactNode; wide?: boolean }[]; layout?: 'inline' | 'grid' }) {
  return <dl className={`ui-metadata ui-metadata-${layout}`}>{items.map(item => <div key={item.label} className={item.wide ? 'ui-metadata-wide' : undefined}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}
// Conserva la paginación por páginas existente; no implementa cursores.
export function Pagination({ page, total, pageSize = 25, onPage }: {
  page: number; total: number; pageSize?: number; onPage: (page: number) => void;
}) {
  return <nav aria-label="Paginación" className="ui-pagination">
    <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
    <span aria-live="polite" aria-atomic="true">Página {page} de {Math.max(1, Math.ceil(total / pageSize))} · {total} {total === 1 ? 'registro' : 'registros'}</span>
    <Button variant="outline" disabled={page * pageSize >= total} onClick={() => onPage(page + 1)}>Siguiente</Button>
  </nav>;
}
// El consumidor decide si hay otra página, cómo cargarla y cuándo deshabilitar.
export function LoadMore(props: ButtonProps) {
  return <div className="ui-load-more"><Button {...props} /></div>;
}
