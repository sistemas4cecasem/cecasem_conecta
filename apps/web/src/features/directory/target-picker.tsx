import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuthIdentity } from '../auth/session';
import { apiRequest } from '../../lib/api/client';
import { searchResponseSchema, validSearchQuery } from './search.contracts';
import { buttonClass, Field, inputClass, Pagination, QueryState } from './directory-ui';
export interface PickedDirectoryTarget { kind: 'ORGANIZATION' | 'PERSON'; id: string; label: string }
/** Selector acotado: utiliza la búsqueda existente, sus contratos y paginación. */
export function DirectoryTargetPicker({ identity, selected, onSelect }: { identity: AuthIdentity; selected: PickedDirectoryTarget | null; onSelect: (target: PickedDirectoryTarget | null) => void }) {
  const [input, setInput] = useState(''), [settled, setSettled] = useState(''), [page, setPage] = useState(1);
  const q = input.trim();
  useEffect(() => { const timer = setTimeout(() => setSettled(q), 350); return () => clearTimeout(timer); }, [q]);
  const ready = validSearchQuery(q) && settled === q;
  const path = 'search?' + new URLSearchParams({ q, page: String(page), pageSize: '25', includeInactive: 'false' });
  const results = useQuery({ queryKey: ['directory', identity.id, 'target-picker', path], enabled: ready && identity.permissions.includes('directory.read'),
    queryFn: async ({ signal }) => searchResponseSchema.parse(await apiRequest(path, { signal })), retry: false });
  const data = ready ? results.data : undefined;
  const organizations = data?.organizations.items.filter(row => row.isActive && !row.duplicateOf) ?? [];
  const people = data?.people.items.filter(row => row.isActive && !row.duplicateOf && row.currentRelationsTotal === 0) ?? [];
  return <section aria-label="Seleccionar objetivo del Directorio" className="space-y-3">
    <p>Selecciona una organización o una persona independiente. Para una persona con vínculo vigente, selecciona su organización.</p>
    <Field label="Buscar objetivo por nombre"><input className={inputClass} type="search" value={input} onChange={e => { setInput(e.target.value); setPage(1); }} /></Field>
    {!identity.permissions.includes('directory.read') && <p role="alert">No tienes permiso para seleccionar fichas del Directorio.</p>}
    {!!q && !validSearchQuery(q) && <p>Escribe al menos dos caracteres de un nombre válido.</p>}
    {ready && <QueryState pending={results.isPending} error={results.isError} retry={results.refetch} />}
    {data && <><ul className="space-y-2">
      {organizations.map(row => <li key={row.id}><button type="button" className={buttonClass}
        onClick={() => onSelect({ kind: 'ORGANIZATION', id: row.id, label: row.name })}>Seleccionar organización: {row.name}</button></li>)}
      {people.map(row => <li key={row.id}><button type="button" className={buttonClass}
        onClick={() => onSelect({ kind: 'PERSON', id: row.id, label: row.displayName })}>Seleccionar persona: {row.displayName}</button></li>)}
    </ul><p>Se muestran fichas activas sin consolidar y personas sin vínculos vigentes.</p>
      {!data.organizations.total && !data.people.total && <p>No se encontraron objetivos.</p>}
      {!!(data.organizations.total + data.people.total) && !organizations.length && !people.length && <p>No hay objetivos seleccionables en esta página. Para una persona con vínculo vigente, busca su organización.</p>}
      {Math.max(data.organizations.total, data.people.total) > 25 && <Pagination page={page} total={Math.max(data.organizations.total, data.people.total)} onPage={setPage} />}
    </>}
    {selected && <p>Objetivo seleccionado: <strong>{selected.label}</strong> · {selected.kind === 'ORGANIZATION' ? 'Organización' : 'Persona independiente'}{' '}
      <button type="button" className={buttonClass} onClick={() => onSelect(null)}>Quitar objetivo</button></p>}
  </section>;
}
