import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { ActionLink as Link } from '../../components/ui/actions';
import { EmptyState, QueryFeedback, StatusBadge } from '../../components/ui/feedback';
import { FormField, Input } from '../../components/ui/forms';
import { FilterBar, PageHeader, Surface } from '../../components/ui/layout';
import { DataList, DataListItem, Pagination } from '../../components/ui/lists';
import { apiRequest } from '../../lib/api/client';
import { useSession } from '../auth/session';
import { searchPermissionKey, searchResponseSchema, validSearchQuery, type DirectorySearchResponse } from './search.contracts';
import { OrganizationFilters } from './organization-filters';
import { organizationFilterKeys } from './organization-filter.contracts';
import { PROCESS_STATE_LABELS } from '../relationships/process-contracts';
import { VerificationPanel } from './verification-panel';
import type { AuthIdentity } from '../auth/session';
import './directory-pages.css';

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
  return <><p><StatusBadge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'Activa' : 'Inactiva'}</StatusBadge>{duplicateOf ? ' · Ficha histórica consolidada' : ''}</p>
    {duplicateOf && <p>Consolidada en: <Link className="inline-flex min-h-11 items-center underline" to={'/' + kind + '/' + duplicateOf.id}>{duplicateOf.name ?? duplicateOf.displayName}</Link></p>}</>;
}
function SearchResults({ data, identity }: { data: DirectorySearchResponse; identity: AuthIdentity }) {
  return <div className="directory-search-results">
    <Surface aria-label="Organizaciones encontradas"><h2 className="directory-result-title">Organizaciones · {data.organizations.total}</h2>
      {data.organizations.total > 0 && data.organizations.items.length === 0 && <p>No hay organizaciones en esta página.</p>}
      <DataList>{data.organizations.items.map(row => <DataListItem key={row.id}>
        <div className="directory-row-heading"><Link appearance="list" to={'/organizations/' + row.id}>{row.name}</Link>
        <ActorState isActive={row.isActive} duplicateOf={row.duplicateOf} kind="organizations" /></div>
        <p className="directory-search-context">{row.country ?? 'País sin registrar'}{row.alias ? ' · ' + row.alias : ''}</p>
        {row.parent && <p>Matriz: <Link className="underline" to={'/organizations/' + row.parent.id}>{row.parent.name}</Link>{!row.parent.isActive && ' (inactiva)'}</p>}
      </DataListItem>)}</DataList></Surface>
    <Surface aria-label="Personas encontradas"><h2 className="directory-result-title">Personas · {data.people.total}</h2>
      {data.people.total > 0 && data.people.items.length === 0 && <p>No hay personas en esta página.</p>}
      <DataList>{data.people.items.map(row => <DataListItem key={row.id}>
        <div className="directory-row-heading"><Link appearance="list" to={'/people/' + row.id}>{row.displayName}</Link>
        <ActorState isActive={row.isActive} duplicateOf={row.duplicateOf} kind="people" /></div>
        {row.currentRelations.map(relation => <p className="directory-search-context" key={relation.id}>{relation.positionTitle ?? 'Cargo sin registrar'} · <Link className="underline" to={'/organizations/' + relation.organization.id}>{relation.organization.name}</Link>{!relation.organization.isActive && ' (inactiva)'}</p>)}
        {row.currentRelationsTotal > row.currentRelations.length && <p>Otros vínculos vigentes disponibles en la ficha.</p>}
      </DataListItem>)}</DataList></Surface>
    {data.email && <Surface aria-label="Correo encontrado">
      <h2 className="directory-result-title">Correo</h2><Link appearance="list" to={'/contact-methods/' + data.email.id}>{data.email.value}</Link>
      <p>Condición del medio: {data.email.condition === 'USABLE' ? 'Utilizable' : 'No utilizable'}</p>
      <p>Este correo está registrado en el Directorio. Sus asociaciones no acreditan comunicaciones realizadas.</p>
      <h3 className="font-semibold">Asociaciones a personas · {data.email.people.total}</h3>
      {data.email.people.items.map(row => <div key={row.id}><Link appearance="context" to={'/people/' + row.person.id}>{row.person.displayName}</Link>
        <p>Asociación {row.isActive ? 'activa' : 'histórica/inactiva'}</p><ActorState isActive={row.person.isActive} duplicateOf={row.person.duplicateOf} kind="people" /></div>)}
      <h3 className="font-semibold">Asociaciones a organizaciones · {data.email.organizations.total}</h3>
      {data.email.organizations.items.map(row => <div key={row.id}><Link appearance="context" to={'/organizations/' + row.organization.id}>{row.organization.name}</Link>
        <p>Asociación {row.isActive ? 'activa' : 'histórica/inactiva'}</p><ActorState isActive={row.organization.isActive} duplicateOf={row.organization.duplicateOf} kind="organizations" /></div>)}
      {(data.email.people.total > data.email.people.items.length || data.email.organizations.total > data.email.organizations.items.length) && <p>Se muestran hasta 10 asociaciones por tipo. Abre el correo para consultar todas con paginación.</p>}
      <p>Para reutilizarlo, abre la ficha de la persona u organización y utiliza su formulario de contactos.</p>
    </Surface>}
    {data.processes && <Surface aria-label="Procesos encontrados"><h2 className="directory-result-title">Procesos · {data.processes.total}</h2>
      {data.processes.total > 0 && !data.processes.items.length && <p>No hay procesos en esta página.</p>}
      <DataList>{data.processes.items.map(process => <DataListItem key={process.id}><ProcessResult process={process} /></DataListItem>)}</DataList>
    </Surface>}
    {data.emailHistory && <Surface aria-label="Antecedentes de correo">
      <h2 className="directory-result-title">Antecedentes de correo · {data.emailHistory.total + data.emailHistory.importedRecords.total}</h2><p>{data.emailHistory.address}</p>
      {!data.email && data.emailHistory.total > 0 && <p>La dirección se conserva en comunicaciones históricas; no tiene un medio de contacto actual en el Directorio.</p>}
      {!data.emailHistory.total && <p>No hay comunicaciones registradas para esta dirección.</p>}
      {data.emailHistory.lastValidContact ? <div className="space-y-2"><h3 className="font-semibold">Último contacto válido registrado</h3><CommunicationResult item={data.emailHistory.lastValidContact} /></div>
        : data.emailHistory.total > 0 && <p>Solo existen antecedentes invalidados; no hay un contacto válido registrado.</p>}
      {data.emailHistory.total > 0 && <><h3 className="font-semibold">Historia de comunicaciones · incluye invalidadas</h3>
        {!data.emailHistory.items.length && <p>No hay antecedentes en esta página.</p>}
        <DataList>{data.emailHistory.items.map(item => <DataListItem key={item.id}><CommunicationResult item={item} /></DataListItem>)}</DataList></>}
      {data.emailHistory.importedRecords.total > 0 && <><h3 className="font-semibold">Antecedentes importados desde Excel · distintos de comunicaciones consolidadas</h3>
        <DataList>{data.emailHistory.importedRecords.items.map(item => <DataListItem key={item.id} className="min-w-0 space-y-3 rounded border border-amber-600 p-3">
          <p className="font-semibold">Antecedente histórico importado · {item.kind === 'SENT' ? 'envío indicado' : item.kind === 'RECEIVED' ? 'respuesta indicada' : item.kind === 'OTHER' ? 'otro antecedente' : 'tipo no especificado'}</p>
          <p>Fecha: {item.occurredOn ?? 'Sin fecha conocida en el archivo'} · Correo: {data.emailHistory!.address}</p>
          {item.organization && <p>Organización: <Link className="underline" to={'/organizations/' + item.organization.id}>{item.organization.name}</Link></p>}
          {item.person && <p>Persona: <Link className="underline" to={'/people/' + item.person.id}>{item.person.displayName}</Link></p>}
          <p>Asunto: {item.subject ?? 'Sin dato en el archivo'}</p><p className="whitespace-pre-wrap">Cuerpo: {item.body ?? 'Sin cuerpo conservado en el archivo'}</p>
          {item.originalObservation && <p className="whitespace-pre-wrap">Observación original: {item.originalObservation}</p>}
          <p>Origen: {item.batch.originalFilename} · lote {item.batch.id} · {item.lastVerifiedAt ? 'verificado' : 'pendiente de verificación'}</p>
          <VerificationPanel identity={identity} path={'imported-history/' + item.id} label="antecedente histórico importado" />
        </DataListItem>)}</DataList></>}
    </Surface>}
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
  return <section className="directory-page directory-search">
    <PageHeader eyebrow="Directorio" title="Búsqueda global" description="Busca organizaciones, personas, correos y el propósito de un proceso." />
    <FilterBar aria-label="Búsqueda y filtros">
    <div className="directory-search-main"><FormField label="Nombre o correo">{control => <Input {...control} type="search" autoComplete="off" value={input}
      onChange={event => update({ q: event.target.value, page: '1' })} />}</FormField></div>
    <div className="directory-search-secondary">
    <label className="directory-search-inactive"><input type="checkbox" checked={includeInactive}
      onChange={event => update({ includeInactive: String(event.target.checked), page: '1' })} />Incluir fichas inactivas y antecedentes consolidados</label>
    <OrganizationFilters identity={identity} params={params} change={update} prefix="organization" presentation="modern" />
    </div></FilterBar>
    {!q && <EmptyState title="Escribe al menos dos caracteres de un nombre o un correo completo." />}
    {!!q && !valid && <EmptyState title="Escribe al menos dos caracteres de un nombre o un correo completo válido." />}
    {valid && !ready && <p role="status">Esperando consulta…</p>}
    {ready && <QueryFeedback pending={results.isPending} error={results.isError} retry={results.refetch} />}
    {data && <>{!total && !data.email ? <EmptyState title="No se encontraron resultados." description={data.emailHistory ? 'No hay antecedentes registrados para esta dirección.' : undefined} /> : <SearchResults data={data} identity={identity} />}
      {total > 0 && <Surface aria-label="Paginación de búsqueda"><p className="ui-description">Página común para organizaciones, personas, procesos y antecedentes de correo; cada grupo indica su total. El último contacto válido es independiente de la página.</p>
        <Pagination page={page} total={total} onPage={value => update({ page: String(value) })} /></Surface>}
    </>}
  </section>;
}
