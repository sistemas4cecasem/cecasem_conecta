import { ActionLink, Button } from '../../components/ui/actions';
import { PageHeader, Surface, FilterBar } from '../../components/ui/layout';
import { FormField, Input, Select, Textarea, FormSection, FormActions } from '../../components/ui/forms';
import { DataList, DataListItem, Metadata, Pagination, LoadMore } from '../../components/ui/lists';
import { EmptyState, QueryFeedback, StatusBadge } from '../../components/ui/feedback';
import './opportunities.css';
import { ContextMeetings } from '../meetings/meeting-components';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { MutationError } from '../directory/directory-ui';
import { DirectoryTargetPicker } from '../directory/target-picker';
import { useProcess } from '../relationships/process-queries';
import { useCommunication } from '../communications/queries';
import { Attachments } from '../files/attachments';
import { deadlineLabel, descriptionFormSchema, stateFormSchema, STATUS_LABELS, type Opportunity } from './contracts';
import { opportunityIdentityKey, useOpportunities, useOpportunity, useOpportunityHistory, useOpportunityMutation } from './queries';
export function OpportunitiesPage() { const identity = useSession().data; if (!identity?.permissions.includes('opportunities.read'))
  return <p role="alert">No tienes permiso para consultar oportunidades.</p>; return <OpportunityList key={opportunityIdentityKey(identity).join(':')} identity={identity}/>; }
function OpportunityList({ identity }: {
  identity: AuthIdentity;
}) {
  const [page, setPage] = useState(1), [params, setParams] = useSearchParams();
  const requestedStatus = params.get('status') ?? 'all';
  const status = requestedStatus === 'all' || Object.hasOwn(STATUS_LABELS, requestedStatus) ? requestedStatus : 'all';
  const filters = new URLSearchParams({ page: String(page), status });
  for (const key of ['processId', 'communicationId', 'organizationId']) {
    const value = params.get(key);
    if (value && z.uuid().safeParse(value).success)
      filters.set(key, value);
  }
  const query = useOpportunities(identity, 'opportunities?' + filters);
  return <section className="opportunities-page">
    <PageHeader eyebrow="Planificación y seguimiento" title="Oportunidades" description="Consulta convocatorias, su origen institucional y el seguimiento de la postulación."
      primaryAction={identity.permissions.includes('opportunities.create') && <ActionLink appearance="action" to="/opportunities/new">Crear oportunidad</ActionLink>} />
    <FilterBar aria-label="Filtros de oportunidades" summary={query.data && <p>{query.data.total} {query.data.total === 1 ? 'oportunidad encontrada' : 'oportunidades encontradas'}</p>}>
      <FormField label="Filtrar por estado">{control => <Select {...control} value={status} onChange={event => { const next = new URLSearchParams(params); if (event.target.value === 'all') next.delete('status'); else next.set('status', event.target.value); next.delete('page'); setParams(next); setPage(1); }}><option value="all">Todos</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>}</FormField>
    </FilterBar>
    <QueryFeedback pending={query.isPending} error={query.isError} retry={query.refetch}/>
    {query.data && !query.data.total && <EmptyState title="No hay oportunidades para estos filtros." />}
    <DataList>{query.data?.items.map(row => <DataListItem key={row.id}>
      <div className="planning-row-heading"><ActionLink appearance="list" to={'/opportunities/' + row.id}>{row.name}</ActionLink><OpportunityStatus row={row}/></div>
      <Metadata items={[{label:'Fecha límite',value:<OpportunityDeadline value={row.deadline}/>}, {label:'Organizaciones',value:row.organizations.map(org=>org.name + (!org.isActive?' (inactiva)':'')).join(' · ')}]}/>
      <Origin row={row}/>
    </DataListItem>)}</DataList>
    {query.data && <Pagination page={page} total={query.data.total} onPage={setPage}/>}
  </section>;
}
function OpportunityStatus({row}:{row:Pick<Opportunity,'status'>}) {
  const tones = {PENDING_REVIEW:'warning',PREPARING:'info',SUBMITTED:'success',DISCARDED:'neutral',FINISHED:'neutral'} as const;
  return <StatusBadge tone={tones[row.status]}>{STATUS_LABELS[row.status]}</StatusBadge>;
}
function OpportunityDeadline({value}:{value:string|null}) {
  if (!value) return <span>Sin fecha límite</span>;
  const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  return <><time className="opportunity-deadline" dateTime={value}>{deadlineLabel(value)}</time>{value < today ? <> · <StatusBadge tone="warning">Fecha vencida</StatusBadge></> : value === today ? <> · <StatusBadge tone="warning">Vence hoy</StatusBadge></> : <> · Fecha futura</>}</>;
}
function Origin({ row }: {
  row: Pick<Opportunity, 'process' | 'communication'>;
}) { return <div className="space-y-2"><p className="ui-field-label">Origen institucional</p>{row.process && <p><ActionLink appearance="context" to={'/relationship-processes/' + row.process.id}>Proceso: {row.process.purpose}</ActionLink></p>}{row.communication && <p><ActionLink appearance="context" to={'/communications/' + row.communication.id}>Comunicación: {row.communication.subject}</ActionLink>{row.communication.validity === 'INVALIDATED' && ' (invalidada; se conserva el antecedente)'}</p>}{!row.process && !row.communication && <p>Investigación o referencia independiente.</p>}</div>; }
export function OpportunityCreatePage() { const identity = useSession().data, [params] = useSearchParams(); if (!identity?.permissions.includes('opportunities.create'))
  return <p role="alert">No tienes permiso para crear oportunidades.</p>; const processId = params.get('processId'), communicationId = params.get('communicationId'); if ([processId, communicationId].some(id => id !== null && !z.uuid().safeParse(id).success))
  return <p role="alert">El enlace de origen no es válido.</p>; return <CreateOpportunity key={opportunityIdentityKey(identity).join(':') + params.toString()} identity={identity} processId={processId} communicationId={communicationId}/>; }
function CreateOpportunity({ identity, processId, communicationId }: {
  identity: AuthIdentity;
  processId: string | null;
  communicationId: string | null;
}) {
  const communication = useCommunication(identity, communicationId ?? ''), resolvedProcessId = processId ?? communication.data?.processId ?? null, process = useProcess(identity, resolvedProcessId ?? ''), navigate = useNavigate();
  const mutation = useOpportunityMutation(identity, 'opportunities', 'POST', 'opportunities.create'), key = useRef<string | null>(null), fingerprint = useRef('');
  const row = process.data, message = communication.data;
  const loading = !!resolvedProcessId && process.isPending || !!communicationId && communication.isPending, failed = !!resolvedProcessId && process.isError || !!communicationId && communication.isError;
  const mismatch = !!message && !!processId && message.processId !== processId;
  return <section className="opportunities-page"><PageHeader eyebrow="Planificación y seguimiento / Oportunidades" title="Crear oportunidad" actions={<ActionLink appearance="context" to="/opportunities">Volver a oportunidades</ActionLink>}/>{resolvedProcessId && <QueryFeedback pending={process.isPending} error={process.isError} retry={process.refetch}/>} {communicationId && <QueryFeedback pending={communication.isPending} error={communication.isError} retry={communication.refetch}/>}<Origin row={{ process: row ? { id: row.id, purpose: row.purpose } : null, communication: message ? { id: message.id, subject: message.subject, processId: message.processId, validity: message.validity } : null }}/>{mismatch && <p role="alert">La comunicación no pertenece al proceso indicado.</p>}<p>El origen quedará fijo después de crear la oportunidad. La fecha límite es una fecha civil, sin hora.</p>{!loading && !failed && !mismatch && <DescriptionForm identity={identity} initialOrganizations={row?.target.kind === 'ORGANIZATION' && row.target.isActive ? [{ id: row.target.id, name: row.target.label, isActive: true }] : []} pending={mutation.isPending} submitLabel="Crear oportunidad" submit={async (values) => { const body = { ...values, processId: resolvedProcessId, communicationId }; const current = JSON.stringify(body); if (fingerprint.current !== current) {
    key.current = crypto.randomUUID();
    fingerprint.current = current;
  } const created = await mutation.mutateAsync({ body, key: key.current! }); navigate('/opportunities/' + created.id); }}/>}<MutationError modern error={mutation.error}/></section>;
}
type DescriptionValues = z.infer<typeof descriptionFormSchema>;
function DescriptionForm({ identity, row, initialOrganizations = [], pending, submitBlocked = false, submitLabel, submit }: {
  identity: AuthIdentity;
  row?: Opportunity;
  initialOrganizations?: Opportunity['organizations'];
  pending: boolean;
  submitBlocked?: boolean;
  submitLabel: string;
  submit: (values: object) => Promise<void>;
}) {
  const [organizations, setOrganizations] = useState(row?.organizations ?? initialOrganizations);
  const form = useForm<DescriptionValues>({ resolver: zodResolver(descriptionFormSchema), defaultValues: { name: row?.name ?? '', description: row?.description ?? '', requirements: row?.requirements ?? '', url: row?.url ?? '', deadline: row?.deadline ?? '', organizationIds: organizations.map(org => org.id) } });
  const setLinks = (next: Opportunity['organizations']) => { setOrganizations(next); form.setValue('organizationIds', next.map(org => org.id), { shouldValidate: true, shouldDirty: true }); };
  return <form className="space-y-4" onSubmit={form.handleSubmit(async (values) => { try {
    await submit({ ...values, description: values.description.trim() || null, requirements: values.requirements.trim() || null, url: values.url.trim() || null, deadline: values.deadline || null });
  }
  catch { /* El error de la mutación conserva el borrador. */ } })}><FormSection heading="Información de la oportunidad" disabled={pending}><FormField label="Nombre" error={form.formState.errors.name?.message}>{control => <><Input {...control} aria-label="Nombre" maxLength={300} {...form.register('name')}/></>}</FormField><FormField label="Descripción" error={form.formState.errors.description?.message}>{control => <><Textarea {...control} aria-label="Descripción" maxLength={10000} {...form.register('description')}/></>}</FormField><FormField label="Requisitos" error={form.formState.errors.requirements?.message}>{control => <><Textarea {...control} aria-label="Requisitos" maxLength={10000} {...form.register('requirements')}/></>}</FormField><FormField label="Enlace de postulación" error={form.formState.errors.url?.message}>{control => <><Input {...control} aria-label="Enlace de postulación" type="url" maxLength={2048} {...form.register('url')}/></>}</FormField><FormField help="Fecha civil, sin hora ni conversión de zona horaria." label="Fecha límite (opcional)" error={form.formState.errors.deadline?.message}>{control => <><Input {...control} aria-label="Fecha límite (opcional)" type="date" {...form.register('deadline')}/></>}</FormField><h2 className="font-semibold">Organizaciones vinculadas</h2><ul className="space-y-2">{organizations.map(org => <li key={org.id}>{org.name}{!org.isActive && ' (inactiva)'} <Button type="button" onClick={() => setLinks(organizations.filter(value => value.id !== org.id))}>Quitar {org.name}</Button></li>)}</ul>{form.formState.errors.organizationIds && <p role="alert">{form.formState.errors.organizationIds.message}</p>}<DirectoryTargetPicker identity={identity} organizationsOnly selected={null} onSelect={target => { if (target?.kind === 'ORGANIZATION' && !organizations.some(org => org.id === target.id))
    setLinks([...organizations, { id: target.id, name: target.label, isActive: true }]); }}/><FormActions><Button type="submit" variant="primary" disabled={pending || submitBlocked}>{pending ? 'Guardando…' : submitLabel}</Button></FormActions></FormSection></form>;
}
export function OpportunityDetailPage() { const identity = useSession().data, { id = '' } = useParams(); if (!identity?.permissions.includes('opportunities.read'))
  return <p role="alert">No tienes permiso para consultar oportunidades.</p>; return <OpportunityDetail key={opportunityIdentityKey(identity).join(':') + id} identity={identity} id={id}/>; }
function OpportunityDetail({ identity, id }: {
  identity: AuthIdentity;
  id: string;
}) { const query = useOpportunity(identity, id), row = query.data; return <section className="opportunities-page">
  <PageHeader eyebrow="Planificación y seguimiento / Oportunidades" title={row?.name ?? 'Oportunidad'} metadata={row && <OpportunityStatus row={row}/>} actions={<ActionLink appearance="context" to="/opportunities">Volver a oportunidades</ActionLink>}/>
  <QueryFeedback pending={query.isPending} error={query.isError} retry={query.refetch}/>
  {row && <>
    <Surface heading="Identificación y seguimiento"><Metadata items={[
      {label:'Fecha límite',value:<OpportunityDeadline value={row.deadline}/>},
      {label:'Registrada por',value:row.createdBy.displayName},
      {label:'Fecha de registro',value:<time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString('es-BO')}</time>},
    ]}/><ul>{row.organizations.map(org => <li key={org.id}><ActionLink to={'/organizations/' + org.id}>{org.name}</ActionLink>{!org.isActive && ' (inactiva)'}</li>)}</ul>
    <Origin row={row}/>{row.discardReason && <p className="whitespace-pre-wrap">Motivo del descarte: {row.discardReason}</p>}{row.finalResult && <p className="whitespace-pre-wrap">Resultado final: {row.finalResult}</p>}
    </Surface>
    <Surface heading="Información complementaria"><h3>Descripción</h3><p className="whitespace-pre-wrap">{row.description ?? 'Sin descripción'}</p><h3>Requisitos</h3><p className="whitespace-pre-wrap">{row.requirements ?? 'Sin requisitos registrados'}</p>{row.url && <a className="ui-link ui-link-context" href={row.url} target="_blank" rel="noopener noreferrer">Abrir enlace de postulación</a>}</Surface>
    {row.canEdit && identity.permissions.includes('opportunities.update') && <EditOpportunity identity={identity} row={row} reload={() => query.refetch()}/>}
    <OpportunityState identity={identity} row={row} reload={() => query.refetch()}/>
    <Attachments modern identity={identity} resource="opportunities" resourceId={id} blocked={['DISCARDED', 'FINISHED'].includes(row.status)}/>
    <Surface heading="Reuniones relacionadas"><ContextMeetings modern identity={identity} opportunityId={id} processId={row.process?.id}/></Surface>
    <OpportunityHistory identity={identity} id={id}/>
  </>}</section>; }

function EditOpportunity({ identity, row, reload }: {
  identity: AuthIdentity;
  row: Opportunity;
  reload: () => unknown;
}) { const [open, setOpen] = useState(false), [base, setBase] = useState(row), [editVersion, setEditVersion] = useState(row.version), mutation = useOpportunityMutation(identity, 'opportunities/' + row.id, 'PATCH', 'opportunities.update'); return <section className="space-y-3"><Button onClick={() => { setBase(row); setEditVersion(row.version); setOpen(value => !value); mutation.reset(); }} disabled={mutation.isPending}>{open ? 'Cerrar edición' : 'Editar descripción y organizaciones'}</Button>{open && <><DescriptionForm key={base.version} identity={identity} row={base} pending={mutation.isPending} submitBlocked={!!mutation.error} submitLabel="Guardar cambios" submit={async (values) => { await mutation.mutateAsync({ body: { ...values, expectedVersion: editVersion } }); setOpen(false); }}/><MutationError modern error={mutation.error} preserveDraft reload={() => void reload()}/><p>La recarga conserva el borrador. Revisa la ficha actual antes de volver a confirmar.</p>{mutation.error && <Button type="button" onClick={() => { setEditVersion(row.version); mutation.reset(); }}>Revisé la versión actual; aplicar mi borrador</Button>}</>}</section>; }
function OpportunityState(props: {
  identity: AuthIdentity;
  row: Opportunity;
  reload: () => unknown;
}) { const [confirmed, setConfirmed] = useState<Opportunity | null>(null); const row = confirmed && confirmed.version > props.row.version ? confirmed : props.row; return <OpportunityStateForm key={confirmed?.version ?? 0} {...props} row={row} onSuccess={setConfirmed}/>; }
function OpportunityStateForm({ identity, row, reload, onSuccess }: {
  identity: AuthIdentity;
  row: Opportunity;
  reload: () => unknown;
  onSuccess: (updated: Opportunity) => void;
}) {
  const form = useForm<z.infer<typeof stateFormSchema>>({ resolver: zodResolver(stateFormSchema), defaultValues: { status: row.allowedStatuses[0], reason: '', finalResult: '' } }), status = useWatch({ control: form.control, name: 'status' }), [version, setVersion] = useState(row.version);
  const mutation = useOpportunityMutation(identity, 'opportunities/' + row.id + (status === 'DISCARDED' ? '/discard' : '/state'), 'POST', status === 'DISCARDED' ? 'opportunities.discard' : status === 'FINISHED' ? 'opportunities.finish' : 'opportunities.state.change');
  if (!row.allowedStatuses.length)
    return <p>Esta oportunidad no admite nuevos cambios de estado.</p>;
  return <form className="space-y-3 rounded border p-4" onChange={() => { if (!form.formState.isDirty) setVersion(row.version); }} onSubmit={form.handleSubmit(async (values) => { try {
    const updated = await mutation.mutateAsync({ body: values.status === 'DISCARDED' ? { expectedVersion: form.formState.isDirty ? version : row.version, reason: values.reason.trim() } : { expectedVersion: form.formState.isDirty ? version : row.version, status: values.status, ...(values.status === 'FINISHED' ? { finalResult: values.finalResult.trim() || null } : {}) } });
    onSuccess(updated);
  }
  catch { /* Conservar valores ante conflicto. */ } })}><h2 className="text-xl font-semibold">Cambiar estado</h2><FormField label="Nuevo estado" error={form.formState.errors.status?.message}>{control => <><Select {...control} aria-label="Nuevo estado" {...form.register('status')}>{row.allowedStatuses.map(value => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</Select></>}</FormField>{status === 'DISCARDED' && <FormField label="Motivo del descarte" error={form.formState.errors.reason?.message}>{control => <><Textarea {...control} aria-label="Motivo del descarte" maxLength={5000} {...form.register('reason')}/></>}</FormField>}{status === 'FINISHED' && <FormField label="Resultado final (opcional)">{control => <><Textarea {...control} aria-label="Resultado final (opcional)" maxLength={5000} {...form.register('finalResult')}/></>}</FormField>}<FormActions><Button type="submit" variant={status === 'DISCARDED' ? 'danger' : 'primary'} disabled={mutation.isPending || !!mutation.error}>{mutation.isPending ? 'Guardando…' : 'Confirmar cambio de estado'}</Button></FormActions><MutationError modern error={mutation.error} reload={() => void reload()}/>{mutation.error && <Button type="button" onClick={() => { setVersion(row.version); mutation.reset(); }}>Revisé la versión actual; habilitar confirmación</Button>}</form>;
}
function OpportunityHistory({ identity, id }: {
  identity: AuthIdentity;
  id: string;
}) { const query = useOpportunityHistory(identity, id), labels = { CREATED: 'Creación', UPDATED: 'Edición descriptiva', STATUS_CHANGED: 'Cambio de estado', DISCARDED: 'Descarte', FINISHED: 'Finalización', FILES_ATTACHED: 'Adjuntos incorporados' }; if (!identity.permissions.includes('files.read'))
  return null; return <Surface heading="Historial institucional" className="planning-history"><QueryFeedback pending={query.isPending} error={query.isError} retry={query.refetch}/><ol className="space-y-3">{query.data?.pages.flatMap(page => page.items).map(item => <li key={item.source + item.id} className="rounded border p-3"><p className="font-semibold">{labels[item.kind]} · {item.actor.displayName} · {new Date(item.createdAt).toLocaleString('es-BO')}</p>{item.newStatus && <p>{item.previousStatus && STATUS_LABELS[item.previousStatus] + ' → '}{STATUS_LABELS[item.newStatus]}</p>}<dl>{Object.entries(item.changes).filter(([field]) => field !== 'organizationIds' || !item.changes.organizations).map(([field, value]) => <div key={field}><dt>{({ name: 'Nombre', description: 'Descripción', requirements: 'Requisitos', url: 'Enlace', deadline: 'Fecha límite', organizationIds: 'Organizaciones', organizations: 'Organizaciones', discardReason: 'Motivo del descarte', finalResult: 'Resultado final', files: 'Archivos' } as Record<string, string>)[field] ?? field}</dt><dd className="whitespace-pre-wrap break-words">{historyValue(value, field)}</dd></div>)}</dl></li>)}</ol>{query.hasNextPage && <LoadMore disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Ver más historial</LoadMore>}</Surface>; }
function historyValue(value: unknown, field: string): import('react').ReactNode {
  if (value === null || value === undefined || value === '')
    return 'Sin valor';
  if (Array.isArray(value))
    return value.map(item => typeof item === 'object' && item !== null && 'name' in item ? String(item.name) : String(item)).join(' · ');
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if ('previous' in object && 'next' in object)
      return <><p>Anterior: {historyValue(object.previous, field)}</p><div>Nuevo: {historyValue(object.next, field)}</div></>;
    return <dl>{Object.entries(object).filter(([key]) => ['name', 'description', 'requirements', 'url', 'deadline', 'organizations'].includes(key)).map(([key, item]) => <div key={key}><dt>{({ name: 'Nombre', description: 'Descripción', requirements: 'Requisitos', url: 'Enlace', deadline: 'Fecha límite', organizations: 'Organizaciones' } as Record<string, string>)[key]}</dt><dd>{historyValue(item, key)}</dd></div>)}</dl>;
  }
  return field === 'deadline' ? deadlineLabel(String(value)) : String(value);
}
