import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../lib/api/client';
import { Button } from '../../components/ui/actions';
export const inputClass = 'ui-control';
export const buttonClass = 'ui-button ui-button-secondary ui-action-medium';
export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return <label className="ui-field ui-legacy-field"><span className="ui-field-label">{label}</span>{children}{error && <span role="alert" className="ui-field-error">{error}</span>}</label>;
}
export function QueryState({ pending, error, failure, retry }: { pending: boolean; error: boolean; failure?: unknown; retry: () => unknown }) {
  if (pending) return <p role="status" className="ui-loading">Cargando…</p>;
  if (error) return <div className="ui-query-error"><p role="alert">{failure instanceof ApiError ? failure.message : 'No se pudo cargar la información.'}</p><button className={buttonClass} onClick={() => void retry()}>Reintentar</button></div>;
  return null;
}
export function Pagination({ page, total, pageSize = 25, onPage }: { page: number; total: number; pageSize?: number; onPage: (page: number) => void }) {
  return <nav aria-label="Paginación" className="flex flex-wrap items-center gap-3">
    <button type="button" className={buttonClass} disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
    <span>Página {page} de {Math.max(1, Math.ceil(total / pageSize))} · {total} registros</span>
    <button type="button" className={buttonClass} disabled={page * pageSize >= total} onClick={() => onPage(page + 1)}>Siguiente</button>
  </nav>;
}
export function MutationError({ error, reload, preserveDraft = false, modern = false }: { error: Error | null; reload?: () => unknown; preserveDraft?: boolean; modern?: boolean }) {
  if (!error) return null;
  const conflict = error instanceof ApiError && error.code === 'VERSION_CONFLICT';
  const duplicateConflict = error instanceof ApiError && ['DUPLICATE_CANDIDATE_STALE', 'CONSOLIDATION_VERSION_CONFLICT'].includes(error.code ?? '');
  const ReloadButton = modern ? Button : 'button';
  return <div role="alert" className={modern ? 'ui-alert ui-tone-danger ui-mutation-error' : 'ui-query-error ui-mutation-error'}>
    <p>{error instanceof ApiError ? error.message : 'No se pudo guardar. Intenta nuevamente.'}</p>
    {error instanceof ApiError && error.details?.principalPath && <Link className="inline-flex min-h-11 items-center underline" to={'/' + error.details.principalPath}>Abrir registro principal</Link>}
    {duplicateConflict && reload && <ReloadButton type="button" className={modern ? undefined : buttonClass} onClick={() => void reload()}>Recargar y revisar coincidencia</ReloadButton>}
    {conflict && reload && <><p>{preserveDraft ? 'La recarga conserva el borrador; revisa la versión actual antes de confirmar nuevamente.' : 'Recargar descartará los cambios del formulario. Copia lo que quieras conservar antes de continuar.'}</p>
      <ReloadButton type="button" className={modern ? undefined : buttonClass} onClick={() => void reload()}>{preserveDraft ? 'Recargar ficha conservando borrador' : 'Recargar ficha y descartar cambios'}</ReloadButton></>}
  </div>;
}
