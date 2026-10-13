import { ApiError } from '../../lib/api/client';
import { ActionLink, Button } from '../../components/ui/actions';
import { Alert, QueryFeedback } from '../../components/ui/feedback';
export { FormField as Field } from '../../components/ui/forms';
export { Pagination } from '../../components/ui/lists';
export const inputClass = 'ui-control';
export const buttonClass = 'ui-button ui-button-secondary ui-action-medium';
export function QueryState({ pending, error, failure, retry }: { pending: boolean; error: boolean; failure?: unknown; retry: () => unknown }) {
  return <QueryFeedback pending={pending} error={error} errorMessage={failure instanceof ApiError ? failure.message : 'No se pudo cargar la información.'} retry={retry} />;
}
export function MutationError({ error, reload, preserveDraft = false }: { error: Error | null; reload?: () => unknown; preserveDraft?: boolean; modern?: boolean }) {
  if (!error) return null;
  const conflict = error instanceof ApiError && error.code === 'VERSION_CONFLICT';
  const duplicateConflict = error instanceof ApiError && ['DUPLICATE_CANDIDATE_STALE', 'CONSOLIDATION_VERSION_CONFLICT'].includes(error.code ?? '');
  return <Alert role="alert" tone="danger" className="ui-mutation-error">
    <p>{error instanceof ApiError ? error.message : 'No se pudo guardar. Intenta nuevamente.'}</p>
    {error instanceof ApiError && error.details?.principalPath && <ActionLink to={'/' + error.details.principalPath}>Abrir registro principal</ActionLink>}
    {duplicateConflict && reload && <Button type="button" onClick={() => void reload()}>Recargar y revisar coincidencia</Button>}
    {conflict && reload && <><p>{preserveDraft ? 'La recarga conserva el borrador; revisa la versión actual antes de confirmar nuevamente.' : 'Recargar descartará los cambios del formulario. Copia lo que quieras conservar antes de continuar.'}</p>
      <Button type="button" onClick={() => void reload()}>{preserveDraft ? 'Recargar ficha conservando borrador' : 'Recargar ficha y descartar cambios'}</Button></>}
  </Alert>;
}
