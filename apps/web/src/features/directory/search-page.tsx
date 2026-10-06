import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { apiRequest } from '../../lib/api/client';
import { useSession } from '../auth/session';
import { buttonClass, Field, inputClass, Pagination, QueryState } from './directory-ui';
import { searchPermissionKey, searchResponseSchema, validSearchQuery, type DirectorySearchResponse } from './search.contracts';
import { OrganizationFilters } from './organization-filters';
import { organizationFilterKeys } from './organization-filter.contracts';
import { PROCESS_STATE_LABELS } from '../relationships/process-contracts';
import { VerificationPanel } from './verification-panel';
import type { AuthIdentity } from '../auth/session';

function ProcessResult({ process }: { process: NonNullable<DirectorySearchResponse['processes']>['items'][number] }) {
  return <div className="min-w-0 space-y-1 break-words">
    <Link className="inline-flex min-h-11 items-center font-semibold underline" to={'/relationship-processes/' + process.id}>{process.purpose}</Link>
    <p>Estado del proceso: {PROCESS_STATE_LABELS[process.state]}</p>
    <p>Actor principal: <Link className="underline" to={'/' + (process.target.kind === 'ORGANIZATION' ? 'organizations/' : 'people/') + process.target.id}>{process.target.label}</Link>{!process.target.isActive && ' (inactivo)'}</p>
  </div>;
}
function CommunicationResult({ item }: { item: NonNullable<DirectorySearchResponse['emailHistory']>['items'][number] }) {
  return <div className="min-w-0 space-y-1 break-words">
    <p>{item.direction === 'SENT' ? 'Enviada' : 'Recibida'} · {item.validity === 'INVALIDATED' ? 'Invalidada · antecedente histórico, no acredita contacto válido' : 'Comunicación válida'}</p>
    <p>Dirección histórica: {item.matchedAddress}</p>
    <p>Fecha real: <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString('es-BO')}</time></p>
    <p>Registrada por: {item.registeredBy.displayName}{!item.registeredBy.isActive && ' (cuenta inactiva)'}</p>
    <ProcessResult process={item.process} />
    <Link className="inline-flex min-h-11 items-center underline" to={'/communications/' + item.id}>Abrir comunicación</Link>
  </div>;
}

function ActorState({ isActive, duplicateOf, kind }: { isActive: boolean; duplicateOf: { id: string; name?: string; displayName?: string } | null; kind: 'organizations' | 'people' }) {
  return <><p>{isActive ? 'Activa' : 'Inactiva'}{duplicateOf ? ' · Ficha histórica consolidada' : ''}</p>
    {duplicateOf && <p>Consolidada en: <Link className="inline-flex min-h-11 items-center underline" to={'/' + kind + '/' + duplicateOf.id}>{duplicateOf.name ?? duplicateOf.displayName}</Link></p>}</>;
}
function SearchResults({ data, identity }: { data: DirectorySearchResponse; identity: AuthIdentity }) {
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
    {data.processes && <section aria-label="Procesos encontrados"><h2 className="text-xl font-semibold">Procesos · {data.processes.total}</h2>
      {data.processes.total > 0 && !data.processes.items.length && <p>No hay procesos en esta página.</p>}
      <ul className="space-y-3">{data.processes.items.map(process => <li key={process.id} className="min-w-0 rounded border p-3"><ProcessResult process={process} /></li>)}</ul>
    </section>}
    {data.emailHistory && <section aria-label="Antecedentes de correo" className="min-w-0 space-y-3 rounded border p-3 break-words">
      <h2 className="text-xl font-semibold">Antecedentes de correo · {data.emailHistory.total + data.emailHistory.importedRecords.total}</h2><p>{data.emailHistory.address}</p>
      {!data.email && data.emailHistory.total > 0 && <p>La dirección se conserva en comunicaciones históricas; no tiene un medio de contacto actual en el Directorio.</p>}
      {!data.emailHistory.total && <p>No hay comunicaciones registradas para esta dirección.</p>}
      {data.emailHistory.lastValidContact ? <div className="space-y-2"><h3 className="font-semibold">Último contacto válido registrado</h3><CommunicationResult item={data.emailHistory.lastValidContact} /></div>
        : data.emailHistory.total > 0 && <p>Solo existen antecedentes invalidados; no hay un contacto válido registrado.</p>}
      {data.emailHistory.total > 0 && <><h3 className="font-semibold">Historia de comunicaciones · incluye invalidadas</h3>
        {!data.emailHistory.items.length && <p>No hay antecedentes en esta página.</p>}
        <ul className="space-y-3">{data.emailHistory.items.map(item => <li key={item.id} className="min-w-0 rounded border p-3"><CommunicationResult item={item} /></li>)}</ul></>}
      {data.emailHistory.importedRecords.total > 0 && <><h3 className="font-semibold">Antecedentes importados desde Excel · distintos de comunicaciones consolidadas</h3>
        <ul className="space-y-3">{data.emailHistory.importedRecords.items.map(item => <li key={item.id} className="min-w-0 space-y-3 rounded border border-amber-600 p-3">
          <p className="font-semibold">Antecedente histórico importado · {item.kind === 'SENT' ? 'envío indicado' : item.kind === 'RECEIVED' ? 'respuesta indicada' : item.kind === 'OTHER' ? 'otro antecedente' : 'tipo no especificado'}</p>
          <p>Fecha: {item.occurredOn ?? 'Sin fecha conocida en el archivo'} · Correo: {data.emailHistory!.address}</p>
          {item.organization && <p>Organización: <Link className="underline" to={'/organizations/' + item.organization.id}>{item.organization.name}</Link></p>}
          {item.person && <p>Persona: <Link className="underline" to={'/people/' + item.person.id}>{item.person.displayName}</Link></p>}
          <p>Asunto: {item.subject ?? 'Sin dato en el archivo'}</p><p className="whitespace-pre-wrap">Cuerpo: {item.body ?? 'Sin cuerpo conservado en el archivo'}</p>
          {item.originalObservation && <p className="whitespace-pre-wrap">Observación original: {item.originalObservation}</p>}
          <p>Origen: {item.batch.originalFilename} · lote {item.batch.id} · {item.lastVerifiedAt ? 'verificado' : 'pendiente de verificación'}</p>
          <VerificationPanel identity={identity} path={'imported-history/' + item.id} label="antecedente histórico importado" />
        </li>)}</ul></>}
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
  const queryParams = new URLSearchParams({ q, page: String(page), pageSize: '25', includeInactive: String(includeInactive) });
  for (const field of organizationFilterKeys) {
    const key = 'organization' + field.charAt(0).toUpperCase() + field.slice(1);
    if (params.has(key)) queryParams.set(key, params.get(key)!);
  }
  const path = 'search?' + queryParams;
  const results = useQuery({ queryKey: ['directory', identity?.id, 'search', path, identity?.role, identity ? searchPermissionKey(identity) : ''],
    enabled: ready && !!identity?.permissions.includes('directory.read'), retry: false, staleTime: 0, gcTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => searchResponseSchema.parse(await apiRequest(path, { signal })) });
  function update(values: Record<string, string>) {
    const next = new URLSearchParams(params); for (const [key, value] of Object.entries(values)) { if (value.trim()) next.set(key, value); else next.delete(key); }
    setParams(next);
  }
  if (!identity?.permissions.includes('directory.read')) return <p role="alert">No tienes permiso para consultar el directorio.</p>;
  const data = ready ? results.data : undefined;
  const total = data ? Math.max(data.organizations.total, data.people.total, data.processes?.total ?? 0, (data.emailHistory?.total ?? 0) + (data.emailHistory?.importedRecords.total ?? 0)) : 0;
  return <section className="min-w-0 space-y-4 break-words"><h1 className="text-2xl font-semibold">Búsqueda global</h1>
    <Link className={buttonClass} to="/organizations">Organizaciones</Link>
    <p>Busca organizaciones, personas, correos y el propósito de un proceso.</p>
    <Field label="Nombre o correo"><input type="search" autoComplete="off" className={inputClass} value={input}
      onChange={event => update({ q: event.target.value, page: '1' })} /></Field>
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={includeInactive}
      onChange={event => update({ includeInactive: String(event.target.checked), page: '1' })} />Incluir fichas inactivas y antecedentes consolidados</label>
    <OrganizationFilters identity={identity} params={params} change={update} prefix="organization" />
    {!q && <p>Escribe al menos dos caracteres de un nombre o un correo completo.</p>}
    {!!q && !valid && <p>Escribe al menos dos caracteres de un nombre o un correo completo válido.</p>}
    {valid && !ready && <p role="status">Esperando consulta…</p>}
    {ready && <QueryState pending={results.isPending} error={results.isError} retry={results.refetch} />}
    {data && <>{!total && !data.email ? <><p>No se encontraron resultados.</p>{data.emailHistory && <p>No hay antecedentes registrados para esta dirección.</p>}</> : <SearchResults data={data} identity={identity} />}
      {total > 0 && <><p>Página común para organizaciones, personas, procesos y antecedentes de correo; cada grupo indica su total. El último contacto válido es independiente de la página.</p>
        <Pagination page={page} total={total} onPage={value => update({ page: String(value) })} /></>}
    </>}
  </section>;
}
