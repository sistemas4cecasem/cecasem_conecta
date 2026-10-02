import { useState } from 'react';
import type { AuthIdentity } from '../auth/session';
import { useHistory } from './queries';
import { Pagination, QueryState } from './directory-ui';
import { dateLabel } from './date-label';
const labels: Record<string, string> = { name: 'Nombre', country: 'País', alias: 'Sigla/nombre alternativo', description: 'Descripción',
  officialWebsite: 'Sitio oficial', parentId: 'Matriz', categoryIds: 'Categorías', isActive: 'Estado activo' };
function valueLabel(value: string | boolean | string[] | null, field: string, references: Record<string, string>): string {
  if (value === null) return 'Sin dato';
  if (typeof value === 'boolean') return value ? 'Activa' : 'Inactiva';
  if (Array.isArray(value)) return value.map(id => references[id] ?? id).join(', ') || 'Sin categorías';
  return field === 'parentId' ? references[value] ?? value : value;
}
export function OrganizationHistory({ identity, path }: { identity: AuthIdentity; path: string }) {
  const [page, setPage] = useState(1);
  const history = useHistory(identity, path + '?page=' + page);
  return <section className="space-y-3"><h2 className="text-xl font-semibold">Historial de modificaciones</h2>
    <QueryState pending={history.isPending} error={history.isError} retry={history.refetch} />
    {history.data?.total === 0 && <p>Aún no hay modificaciones.</p>}
    <ol className="space-y-3">{history.data?.items.map(entry => <li key={entry.id} className="min-w-0 space-y-1 rounded border p-3 break-words">
      <p>{dateLabel(entry.createdAt)} · {entry.actor.givenNames} {entry.actor.familyNames}</p>
      <p className="font-semibold">{labels[entry.field] ?? entry.field}</p>
      <p>Antes: {valueLabel(entry.previousValue, entry.field, history.data?.references ?? {})}</p>
      <p>Después: {valueLabel(entry.newValue, entry.field, history.data?.references ?? {})}</p>
    </li>)}</ol>
    {history.data && <Pagination page={page} total={history.data.total} onPage={setPage} />}
  </section>;
}
