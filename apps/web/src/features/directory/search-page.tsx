import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { apiRequest } from '../../lib/api/client';
import { useSession } from '../auth/session';
import { buttonClass, Field, inputClass, Pagination, QueryState } from './directory-ui';
import { searchResponseSchema, validSearchQuery, type DirectorySearchResponse } from './search.contracts';

function ActorState({ isActive, duplicateOf, kind }: { isActive: boolean; duplicateOf: { id: string; name?: string; displayName?: string } | null; kind: 'organizations' | 'people' }) {
  return <><p>{isActive ? 'Activa' : 'Inactiva'}{duplicateOf ? ' · Ficha histórica consolidada' : ''}</p>
    {duplicateOf && <p>Consolidada en: <Link className="inline-flex min-h-11 items-center underline" to={'/' + kind + '/' + duplicateOf.id}>{duplicateOf.name ?? duplicateOf.displayName}</Link></p>}</>;
}
function SearchResults({ data }: { data: DirectorySearchResponse }) {
  return <div className="space-y-6">
    <section aria-label="Organizaciones encontradas"><h2 className="text-xl font-semibold">Organizaciones · {data.organizations.total}</h2>
      {data.organizations.total > 0 && data.organizations.items.length === 0 && <p>No hay organizaciones en esta página.</p>}
      <ul className="space-y-3">{data.organizations.items.map(row => <li key={row.id} className="min-w-0 rounded border p-3 break-words">
        <Link className="inline-flex min-h-11 items-center font-semibold underline" to={'/organizations/' + row.id}>{row.name}</Link>
        <ActorState isActive={row.isActive} duplicateOf={row.duplicateOf} kind="organizations" />
        <p>{row.country ?? 'País sin registrar'}{row.alias ? ' · ' + row.alias : ''}</p>
        {row.parent && <p>Matriz: <Link className="underline" to={'/organizations/' + row.parent.id}>{row.parent.name}</Link>{!row.parent.isActive && ' (inactiva)'}</p>}
      </li>)}</ul></section>
    <section aria-label="Personas encontradas"><h2 className="text-xl font-semibold">Personas · {data.people.total}</h2>
      {data.people.total > 0 && data.people.items.length === 0 && <p>No hay personas en esta página.</p>}
      <ul className="space-y-3">{data.people.items.map(row => <li key={row.id} className="min-w-0 rounded border p-3 break-words">
        <Link className="inline-flex min-h-11 items-center font-semibold underline" to={'/people/' + row.id}>{row.displayName}</Link>
        <ActorState isActive={row.isActive} duplicateOf={row.duplicateOf} kind="people" />
        {row.currentRelations.map(relation => <p key={relation.id}>{relation.positionTitle ?? 'Cargo sin registrar'} · <Link className="underline" to={'/organizations/' + relation.organization.id}>{relation.organization.name}</Link>{!relation.organization.isActive && ' (inactiva)'}</p>)}
        {row.currentRelationsTotal > row.currentRelations.length && <p>Otros vínculos vigentes disponibles en la ficha.</p>}
      </li>)}</ul></section>
    {data.email && <section aria-label="Correo encontrado" className="min-w-0 space-y-3 rounded border p-3 break-words">
      <h2 className="text-xl font-semibold">Correo</h2><Link className="inline-flex min-h-11 items-center font-semibold underline" to={'/contact-methods/' + data.email.id}>{data.email.value}</Link>
      <p>Condición del medio: {data.email.condition === 'USABLE' ? 'Utilizable' : 'No utilizable'}</p>
      <p>Este correo está registrado en el Directorio. Sus asociaciones no acreditan comunicaciones realizadas.</p>
      <h3 className="font-semibold">Asociaciones a personas · {data.email.people.total}</h3>
      {data.email.people.items.map(row => <div key={row.id}><Link className="inline-flex min-h-11 items-center underline" to={'/people/' + row.person.id}>{row.person.displayName}</Link>
        <p>Asociación {row.isActive ? 'activa' : 'histórica/inactiva'}</p><ActorState isActive={row.person.isActive} duplicateOf={row.person.duplicateOf} kind="people" /></div>)}
      <h3 className="font-semibold">Asociaciones a organizaciones · {data.email.organizations.total}</h3>
      {data.email.organizations.items.map(row => <div key={row.id}><Link className="inline-flex min-h-11 items-center underline" to={'/organizations/' + row.organization.id}>{row.organization.name}</Link>
        <p>Asociación {row.isActive ? 'activa' : 'histórica/inactiva'}</p><ActorState isActive={row.organization.isActive} duplicateOf={row.organization.duplicateOf} kind="organizations" /></div>)}
      {(data.email.people.total > data.email.people.items.length || data.email.organizations.total > data.email.organizations.items.length) && <p>Se muestran hasta 10 asociaciones por tipo. Abre el correo para consultar todas con paginación.</p>}
      <p>Para reutilizarlo, abre la ficha de la persona u organización y utiliza su formulario de contactos.</p>
    </section>}
  </div>;
}
export default function DirectorySearchPage() {
  const identity = useSession().data;
  const [params, setParams] = useSearchParams();
  const input = params.get('q') ?? '';
  const q = input.trim().replace(/\s+/gu, ' ');
  const requestedPage = Number(params.get('page') ?? '1');
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 10000 ? requestedPage : 1;
  const includeInactive = params.get('includeInactive') === 'true';
  const [settled, setSettled] = useState('');
  useEffect(() => { const timer = setTimeout(() => setSettled(q), 350); return () => clearTimeout(timer); }, [q]);
  const valid = validSearchQuery(q), ready = valid && settled === q;
  const path = 'search?' + new URLSearchParams({ q, page: String(page), pageSize: '25', includeInactive: String(includeInactive) });
  const results = useQuery({ queryKey: ['directory', identity?.id, 'search', path],
    enabled: ready && !!identity?.permissions.includes('directory.read'), retry: false, staleTime: 0, gcTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => searchResponseSchema.parse(await apiRequest(path, { signal })) });
  function update(values: Record<string, string>) {
    const next = new URLSearchParams(params); for (const [key, value] of Object.entries(values)) next.set(key, value);
    setParams(next, { replace: true });
  }
  if (!identity?.permissions.includes('directory.read')) return <p role="alert">No tienes permiso para consultar el directorio.</p>;
  const data = ready ? results.data : undefined;
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Buscar en el Directorio</h1>
    <Link className={buttonClass} to="/organizations">Organizaciones</Link>
    <Field label="Nombre o correo"><input type="search" autoComplete="off" className={inputClass} value={input}
      onChange={event => update({ q: event.target.value, page: '1' })} /></Field>
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={includeInactive}
      onChange={event => update({ includeInactive: String(event.target.checked), page: '1' })} />Incluir fichas inactivas y antecedentes consolidados</label>
    {!q && <p>Escribe al menos dos caracteres de un nombre o un correo completo.</p>}
    {!!q && !valid && <p>Escribe al menos dos caracteres de un nombre o un correo completo válido.</p>}
    {valid && !ready && <p role="status">Esperando consulta…</p>}
    {ready && <QueryState pending={results.isPending} error={results.isError} retry={results.refetch} />}
    {data && <>{!data.organizations.total && !data.people.total && !data.email ? <p>No se encontraron resultados.</p> : <SearchResults data={data} />}
      {Math.max(data.organizations.total, data.people.total) > 0 && <><p>Página común para organizaciones y personas; cada grupo indica su total.</p>
        <Pagination page={page} total={Math.max(data.organizations.total, data.people.total)} onPage={value => update({ page: String(value) })} /></>}
    </>}
  </section>;
}
