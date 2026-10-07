import type { ComponentProps, ReactNode } from 'react';
import { Button, type ButtonProps } from './actions';

export function DataList({ className = '', ...props }: ComponentProps<'ul'>) {
  return <ul {...props} className={`ui-data-list ${className}`} />;
}
export function DataListItem({ className = '', ...props }: ComponentProps<'li'>) {
  return <li {...props} className={`ui-data-list-item ${className}`} />;
}
export function Metadata({ items }: { items: readonly { label: string; value: ReactNode }[] }) {
  return <dl className="ui-metadata">{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}
// Conserva la paginación por páginas existente; no implementa cursores.
export function Pagination({ page, total, pageSize = 25, onPage }: {
  page: number; total: number; pageSize?: number; onPage: (page: number) => void;
}) {
  return <nav aria-label="Paginación" className="ui-pagination">
    <Button disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
    <span>Página {page} de {Math.max(1, Math.ceil(total / pageSize))} · {total} registros</span>
    <Button disabled={page * pageSize >= total} onClick={() => onPage(page + 1)}>Siguiente</Button>
  </nav>;
}
// El consumidor decide si hay otra página, cómo cargarla y cuándo deshabilitar.
export function LoadMore(props: ButtonProps) {
  return <div className="ui-load-more"><Button {...props} /></div>;
}
