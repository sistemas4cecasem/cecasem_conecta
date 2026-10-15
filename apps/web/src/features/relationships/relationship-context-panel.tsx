import { ActionLink } from '../../components/ui/actions';

import type { AuthIdentity } from '../auth/session';
import type { PickedDirectoryTarget } from '../directory/target-picker';
import { buttonClass } from '../directory/directory-ui';
import { canReadRelationshipContext, useRelationshipContext } from './context-queries';
import type { ActorContext } from './context-contracts';
import { PROCESS_RESULT_LABELS, PROCESS_STATE_LABELS } from './process-contracts';
export function RelationshipContextPanel({ identity, target, showRestriction = true, presentation = 'default' }: { identity: AuthIdentity; target: PickedDirectoryTarget | null; showRestriction?: boolean; presentation?: 'default' | 'person-profile' }) {
  const query = useRelationshipContext(identity, target, presentation === 'person-profile' ? 'person-profile' : undefined);
  if (!target || !canReadRelationshipContext(identity)) return null;
  return <section aria-label="Contexto institucional previo" className="min-w-0 space-y-4 rounded border border-slate-400 p-4 break-words">
    <h2 className="text-lg font-semibold">{presentation === 'person-profile' ? 'Antecedentes' : 'Contexto institucional previo'}</h2>
    {query.isPending && <p role="status">Consultando gestiones relacionadas…</p>}
    {query.isError && <div role="alert"><p>No se pudo consultar el contexto institucional. Puedes reintentar; el servidor comprobará las restricciones al guardar.</p>
      <button type="button" className={buttonClass} onClick={() => { void query.refetch(); }}>Reintentar contexto</button></div>}
    {query.data && <><ActorContextContent context={query.data} showRestriction={showRestriction} hideTarget={presentation === 'person-profile'} compact={presentation === 'person-profile'} />
      {presentation === 'person-profile' && !query.data.activeIntents.total && !query.data.activeProcesses.total && !query.data.recentClosedProcesses.total && !query.data.hasRegisteredCommunicationHistory && !query.data.emailProcesses?.total && <p>Sin procesos ni comunicaciones registrados.</p>}
      {!!query.data.emailProcesses?.total && <section className="space-y-3" aria-label="Procesos relacionados con sus correos">
        <h3 className="font-semibold">Procesos por correo</h3>
        <ul className="space-y-2">{query.data.emailProcesses.items.map(process => <li key={process.id}><ActionLink to={'/relationship-processes/'+process.id}>{process.purpose}</ActionLink> · {PROCESS_STATE_LABELS[process.state]}</li>)}</ul>
        <Limited items={query.data.emailProcesses.items.length} total={query.data.emailProcesses.total} />
      </section>}
      {!!query.data.emailProcesses?.addresses.length && <details className="organization-record-details">
        <summary>Consultar por correo</summary>
        <ul className="space-y-2 pt-2">{query.data.emailProcesses.addresses.map(address => <li key={address}><ActionLink to={'/directory/search?q='+encodeURIComponent(address)}>{address}</ActionLink></li>)}</ul>
      </details>}
      {presentation !== 'person-profile' && !!query.data.relatedOrganizationContext.total && <section className="space-y-3" aria-label="Contexto de organizaciones vinculadas">
        <h3 className="font-semibold">Organizaciones con vínculo vigente</h3>
        <p>Consulta estas gestiones institucionales. Los registros de la persona y de cada organización se muestran por separado; una gestión institucional no demuestra contacto con esta persona.</p>
        {query.data.relatedOrganizationContext.items.map(context => <div key={context.target.id} className="space-y-3 rounded border p-3"><ActorContextContent context={context} showRestriction /></div>)}
        {query.data.relatedOrganizationContext.total > query.data.relatedOrganizationContext.items.length && <p>Se muestran {query.data.relatedOrganizationContext.items.length} de {query.data.relatedOrganizationContext.total} organizaciones. Consulta los vínculos en la ficha de la persona.</p>}
      </section>}
      {presentation !== 'person-profile' && <p className="text-sm">CECASEM Conecta solo puede mostrar comunicaciones registradas en el sistema.</p>}
    </>}
  </section>;
}
function ActorContextContent({ context, showRestriction, hideTarget = false, compact = false }: { context: ActorContext; showRestriction: boolean; hideTarget?: boolean; compact?: boolean }) {
  const { target } = context;
  return <>{!hideTarget && <h3 className="font-semibold"><ActionLink to={'/' + (target.kind === 'ORGANIZATION' ? 'organizations/' : 'people/') + target.id}>{target.label}</ActionLink>{!target.isActive && ' (ficha inactiva)'}</h3>}
    {showRestriction && context.restriction && <aside role="alert" className="space-y-2 rounded border-2 border-red-800 bg-red-50 p-4 text-red-950">
      <p className="font-bold">RESTRICCIÓN ACTIVA — NO CONTACTAR</p><p>Aplica a {target.label}.</p><p className="whitespace-pre-wrap">{context.restriction.reason}</p>
      <ActionLink appearance="context" to={'/contact-restrictions/' + context.restriction.id}>Consultar restricción</ActionLink>
    </aside>}
    {!!context.activeProcesses.total && <section className="space-y-2 rounded border border-amber-600 p-3" aria-label={'Procesos activos de ' + target.label}>
      <h4 className="font-semibold">{compact ? 'Procesos activos' : 'Advertencia: ' + context.activeProcesses.total + ' procesos activos'}</h4>{!compact && <p>Revisa el contexto antes de continuar. Pueden existir procesos paralelos con objetivos diferentes.</p>}
      {!compact && !context.hasRegisteredCommunicationHistory && <p>Existe un proceso activo, pero no hay comunicaciones válidas registradas.</p>}
      <ProcessList context={context} closed={false} /></section>}
    {!!context.activeIntents.total && <section className="space-y-2 rounded border border-amber-600 p-3" aria-label={'Intenciones activas de ' + target.label}>
      <h4 className="font-semibold">{compact ? 'Intenciones activas' : 'Advertencia: ' + context.activeIntents.total + ' intenciones activas'}</h4>{!compact && <p>Hay acercamientos planeados; una intención no demuestra comunicación real. Esta advertencia no impide una nueva gestión.</p>}
      <ul className="space-y-2">{context.activeIntents.items.map(intent => <li key={intent.id}><ActionLink className="whitespace-pre-wrap" to={'/contact-intents/' + intent.id}>{intent.purpose}</ActionLink>
        <p>Autor: {intent.author.displayName}{!intent.author.isActive && ' (cuenta inactiva)'} · Creación: {date(intent.createdAt)} · Última actividad: {date(intent.lastActivityAt)}</p></li>)}</ul>
      <Limited items={context.activeIntents.items.length} total={context.activeIntents.total} />
    </section>}
    {(!compact || context.hasRegisteredCommunicationHistory) && <CommunicationHistory context={context} compact={compact} />}
    {!!context.recentClosedProcesses.total && <section className="space-y-2 rounded border border-slate-400 p-3" aria-label={'Procesos cerrados de ' + target.label}>
      <h4 className="font-semibold">{compact ? 'Procesos cerrados' : 'Información: ' + context.recentClosedProcesses.total + ' procesos cerrados'}</h4>{!compact && <p>Los antecedentes cerrados no impiden nuevos acercamientos.</p>}
      <ProcessList context={context} closed /></section>}
    {!compact && !context.activeIntents.total && !context.activeProcesses.total && !context.recentClosedProcesses.total && <p>{context.hasRelationshipHistory ? 'No hay gestiones activas ni procesos cerrados para este objetivo. Existen intenciones históricas.' : 'No hay gestiones registradas para este objetivo.'}</p>}
  </>;
}
function CommunicationHistory({ context, compact = false }: { context: ActorContext; compact?: boolean }) {
  const summary = context.communicationSummary;
  return <section className={'space-y-2 rounded border p-3 ' + (context.hasRegisteredCommunicationHistory ? 'border-amber-600' : 'border-slate-400')} aria-label={'Comunicaciones registradas de ' + context.target.label}>
    <h4 className="font-semibold">Comunicaciones registradas</h4>
    {!context.hasRegisteredCommunicationHistory ? <p>No hay comunicaciones válidas registradas en CECASEM Conecta.</p> : <>
      {compact ? <p>{summary.total} {summary.total === 1 ? 'comunicación registrada' : 'comunicaciones registradas'}</p> : <p>Advertencia: CECASEM tiene {summary.total} comunicaciones válidas registradas con este objetivo. Los antecedentes no impiden una nueva gestión.</p>}
      <p>Última comunicación: {summary.lastDirection === 'SENT' ? 'Enviada' : 'Recibida'} — {summary.lastOccurredAt && date(summary.lastOccurredAt)}</p>
      <ul className="space-y-3">{context.recentCommunications.map(item => <li key={item.id}>
        <p>{item.direction === 'SENT' ? 'Enviada' : 'Recibida'} · Fecha real: {date(item.occurredAt)}</p>
        <ActionLink className="whitespace-pre-wrap" to={'/communications/' + item.id}>{item.subject}</ActionLink>
        <p>Remitente: {item.sender}</p>
        <p>Destinatarios: {item.recipients.map(recipient => (recipient.type === 'TO' ? 'Para' : recipient.type) + ': ' + recipient.addressOriginal).join(' · ')}</p>
        {item.recipientTotal > item.recipients.length && <p>Se muestran {item.recipients.length} de {item.recipientTotal} destinatarios. Consulta el detalle para ver todos.</p>}
        <p>Proceso: <ActionLink className="whitespace-pre-wrap" to={'/relationship-processes/' + item.process.id}>{item.process.purpose}</ActionLink></p>
      </li>)}</ul>
      {summary.total > context.recentCommunications.length && <p>Se muestran {context.recentCommunications.length} de {summary.total} comunicaciones.</p>}
    </>}
  </section>;
}
function date(value: string) { return new Date(value).toLocaleString('es-BO'); }
function Limited({ items, total }: { items: number; total: number }) { return total > items ? <p>Se muestran {items} de {total} gestiones.</p> : null; }
function ProcessList({ context, closed }: { context: ActorContext; closed: boolean }) {
  const processes = closed ? context.recentClosedProcesses : context.activeProcesses;
  return <><ul className="space-y-2">{processes.items.map(process => <li key={process.id}><ActionLink className="whitespace-pre-wrap" to={'/relationship-processes/' + process.id}>{process.purpose}</ActionLink>
    <p>{PROCESS_STATE_LABELS[process.state]} · Creador: {process.createdBy.displayName}{!process.createdBy.isActive && ' (cuenta inactiva)'} · Creación: {date(process.createdAt)} · Última actividad formal: {date(process.lastActivityAt)}</p>
    {closed && <p>Resultado: {process.result ? PROCESS_RESULT_LABELS[process.result] : 'Sin resultado'} · Cierre: {process.closedAt ? date(process.closedAt) : 'Sin fecha'}</p>}
  </li>)}</ul><Limited items={processes.items.length} total={processes.total} /></>;
}
