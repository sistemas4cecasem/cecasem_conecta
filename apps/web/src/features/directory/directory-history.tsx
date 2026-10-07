import { useState } from 'react';
import type { AuthIdentity } from '../auth/session';
import { useHistory } from './queries';
import { Pagination, QueryState } from './directory-ui';
import { dateLabel } from './date-label';
import { historyObjectLabels, historyOperationLabel, historyValueLabel, referenceLabel } from './directory-history-format';
export function DirectoryHistory({ identity, path, modern = false, headingLevel = 2 }: { identity: AuthIdentity; path: string; modern?: boolean; headingLevel?: 2 | 3 }) {
  const [page, setPage] = useState(1);
  const history = useHistory(identity, path + '?page=' + page);
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const OperationHeading = headingLevel === 3 ? 'h4' : 'h3';
  return <section className="min-w-0 space-y-3 break-words" aria-label="Historial de modificaciones">
    <Heading className={modern?'directory-history-heading':'text-xl font-semibold'}>Historial de modificaciones</Heading>
    <p>Los cambios de una misma operación se muestran juntos. La paginación cuenta operaciones completas.</p>
    <QueryState pending={history.isPending} error={history.isError} retry={history.refetch} />
    {history.data?.total === 0 && <p>Aún no hay modificaciones.</p>}
    <ol className="space-y-4">{history.data?.items.map(operation => <li key={operation.operationId} className={modern?'directory-history-operation space-y-3':'min-w-0 space-y-3 rounded border p-3 break-words'}>
      <OperationHeading className="font-semibold">{historyOperationLabel(operation)} · {historyObjectLabels[operation.objectType]} · {operation.changes.length} {operation.changes.length === 1 ? 'cambio' : 'cambios'}</OperationHeading>
      <p><time dateTime={operation.createdAt}>{dateLabel(operation.createdAt)}</time> · {operation.actor.givenNames} {operation.actor.familyNames}{!operation.actor.isActive && ' · Usuario actualmente desactivado'}</p>
      {operation.relatedReferences.length > 0 && <p>Contexto al registrar: {operation.relatedReferences.map(referenceLabel).join(' · ')}</p>}
      {operation.replacement && <p>{operation.replacement.previous.kind === 'contactMethod' ? 'Canal anterior' : 'Ficha original'}: {referenceLabel(operation.replacement.previous)} · {operation.replacement.next.kind === 'contactMethod' ? 'Canal nuevo' : 'Principal'}: {referenceLabel(operation.replacement.next)}</p>}
      {!operation.contextRecorded && <p>Registro anterior: no se guardaron etiquetas de referencias ni contexto histórico. Los valores originales se conservan.</p>}
      <ul className="space-y-3">{operation.changes.map(change => <li key={change.field}>
        <p className="font-semibold">{change.label}</p>
        <p>Antes: {historyValueLabel(change, 'previous')}</p>
        <p>Después: {historyValueLabel(change, 'new')}</p>
        {change.field === 'categoryIds' && <>
          {change.added.map(ref => <p key={'added-' + ref.id}>Categoría añadida: {referenceLabel(ref)}</p>)}
          {change.removed.map(ref => <p key={'removed-' + ref.id}>Categoría retirada: {referenceLabel(ref)}</p>)}
        </>}
      </li>)}</ul>
    </li>)}</ol>
    {history.data && <Pagination page={page} total={history.data.total} onPage={setPage} />}
  </section>;
}
