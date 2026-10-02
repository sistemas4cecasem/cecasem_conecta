import type { ReactNode } from 'react';
import { ApiError } from '../../lib/api/client';
export const inputClass = 'mt-1 min-h-11 w-full rounded border border-slate-400 bg-white px-3 py-2 text-slate-900';
export const buttonClass = 'min-h-11 rounded border border-slate-500 px-3 py-2 disabled:opacity-50';
export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return <label className="block min-w-0">{label}{children}{error && <span role="alert" className="block text-sm text-red-800">{error}</span>}</label>;
}
export function QueryState({ pending, error, retry }: { pending: boolean; error: boolean; retry: () => unknown }) {
  if (pending) return <p role="status">Cargando…</p>;
  if (error) return <div><p role="alert">No se pudo cargar la información.</p><button className={buttonClass} onClick={() => void retry()}>Reintentar</button></div>;
  return null;
}
export function Pagination({ page, total, pageSize = 25, onPage }: { page: number; total: number; pageSize?: number; onPage: (page: number) => void }) {
  return <nav aria-label="Paginación" className="flex flex-wrap items-center gap-3">
    <button className={buttonClass} disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
    <span>Página {page} de {Math.max(1, Math.ceil(total / pageSize))} · {total} registros</span>
    <button className={buttonClass} disabled={page * pageSize >= total} onClick={() => onPage(page + 1)}>Siguiente</button>
  </nav>;
}
export function MutationError({ error, reload }: { error: Error | null; reload?: () => unknown }) {
  if (!error) return null;
  const conflict = error instanceof ApiError && error.code === 'VERSION_CONFLICT';
  return <div role="alert" className="space-y-2 rounded border border-red-400 p-3">
    <p>{error instanceof ApiError ? error.message : 'No se pudo guardar. Intenta nuevamente.'}</p>
    {conflict && reload && <><p>Recargar descartará los cambios del formulario. Copia lo que quieras conservar antes de continuar.</p>
      <button type="button" className={buttonClass} onClick={() => void reload()}>Recargar ficha y descartar cambios</button></>}
  </div>;
}
