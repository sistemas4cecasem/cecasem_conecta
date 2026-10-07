import type { z } from 'zod';
import type { dashboardSchema } from './dashboard-contract';
import { ActionLink } from '../../components/ui/actions';
import { EmptyState } from '../../components/ui/feedback';
import { Surface } from '../../components/ui/layout';
import { DataList, DataListItem, Metadata } from '../../components/ui/lists';
import { MetricCard } from '../../components/ui/metric-card';

type Dashboard = z.infer<typeof dashboardSchema>;
type InstitutionalPanel = Extract<Dashboard, { view: 'institutional' }>;
type ResearchPanel = Extract<Dashboard, { view: 'research' }>;
type PlanningPanel = Extract<Dashboard, { view: 'planning' }>;

function MeetingList({ rows }: { rows: InstitutionalPanel['upcomingMeetings'] }) {
  if (!rows.length) return <EmptyState title="No hay reuniones próximas." />;
  return <DataList>{rows.map(row => <DataListItem key={row.id}>
    <ActionLink appearance="list" to={`/meetings/${row.id}`}>{row.purpose}</ActionLink>
    <Metadata items={[
      { label: 'Fecha y hora', value: <time dateTime={row.scheduledAt}>{new Date(row.scheduledAt).toLocaleString('es-BO', {
        timeZone: row.timezone, dateStyle: 'medium', timeStyle: 'short',
      })}</time> },
      { label: 'Zona horaria', value: row.timezone },
      ...(row.relatedTitle ? [{ label: 'Relacionado con', value: row.relatedTitle }] : []),
    ]} />
  </DataListItem>)}</DataList>;
}

export function InstitutionalDashboard({ panel }: { panel: InstitutionalPanel }) {
  return <div className="dashboard-stack">
    <section aria-label="Procesos y oportunidades" className="dashboard-section">
      <h2>Procesos y oportunidades</h2>
      <div className="dashboard-metrics">
        <MetricCard label="Procesos activos" value={panel.activeProcesses} to="/relationship-processes" />
        <MetricCard label="Esperando respuesta" value={panel.waitingResponseProcesses} to="/relationship-processes?state=WAITING_RESPONSE" />
        <MetricCard label="Pendientes de revisión" value={panel.opportunities.pendingReview} to="/opportunities?status=PENDING_REVIEW" />
        <MetricCard label="En preparación" value={panel.opportunities.preparing} to="/opportunities?status=PREPARING" />
        <MetricCard label="Postulaciones pendientes" value={panel.pendingApplications} to="/opportunities?status=SUBMITTED" description="Postuladas que aún no están finalizadas" />
      </div>
    </section>
    <div className="dashboard-columns">
      <section aria-label="Directorio" className="dashboard-section">
        <h2>Directorio</h2><p className="ui-description">Actualización de la información institucional.</p>
        <div className="dashboard-metrics">
          <MetricCard label="Requieren revisión" value={panel.organizationsReviewDue} to="/organizations?status=active&verificationStatus=REVIEW_DUE" />
          <MetricCard label="Nunca verificadas" value={panel.organizationsNeverVerified} to="/organizations?status=active&verificationStatus=NEVER_VERIFIED" />
        </div>
      </section>
      <Surface heading={`Reuniones próximas (${panel.upcomingMeetingCount})`} actions={<ActionLink appearance="context" to="/meetings">Ver reuniones</ActionLink>}>
        <MeetingList rows={panel.upcomingMeetings} />
      </Surface>
    </div>
  </div>;
}

export function ResearchDashboard({ panel }: { panel: ResearchPanel }) {
  return <div className="dashboard-columns dashboard-research">
    <Surface heading="Procesos activos relevantes">
      <div className="dashboard-process-summary"><MetricCard label="Tus procesos activos" value={panel.activeProcesses} to="/relationship-processes" /></div>
      {panel.relevantProcesses.length ? <DataList>{panel.relevantProcesses.map(row => <DataListItem key={row.id}>
        <ActionLink appearance="list" to={`/relationship-processes/${row.id}`}>{row.purpose}</ActionLink>
        <Metadata items={[
          { label: 'Actor', value: row.target ?? 'Sin organización o persona indicada' },
          { label: 'Última actividad', value: <time dateTime={row.lastActivityAt}>{new Date(row.lastActivityAt).toLocaleDateString('es-BO')}</time> },
        ]} />
      </DataListItem>)}</DataList> : <EmptyState title="No tienes procesos activos relevantes." />}
    </Surface>
    <div className="dashboard-stack">
      <Surface heading={`Intenciones activas (${panel.activeIntents})`} actions={<ActionLink appearance="context" to="/contact-intents">Ver intenciones</ActionLink>}>
        {panel.relevantIntents.length ? <DataList>{panel.relevantIntents.map(row => <DataListItem key={row.id}>
          <ActionLink appearance="list" to={`/contact-intents/${row.id}`}>{row.purpose}</ActionLink>
          <Metadata items={[{ label: 'Actor', value: row.target ?? 'Sin organización o persona indicada' }]} />
        </DataListItem>)}</DataList> : <EmptyState title="No tienes intenciones activas." />}
      </Surface>
      <Surface heading={`Recordatorios sin leer (${panel.unreadReminders})`} actions={<ActionLink appearance="context" to="/notifications">Ver notificaciones</ActionLink>}>
        {panel.reminderItems.length ? <DataList>{panel.reminderItems.map(row => <DataListItem key={row.id}>
          <ActionLink appearance="list" to={row.processId ? `/relationship-processes/${row.processId}` : row.intentId ? `/contact-intents/${row.intentId}` : '/notifications'}>{row.subject}</ActionLink>
          <Metadata items={[{ label: 'Fecha', value: <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleDateString('es-BO')}</time> }]} />
        </DataListItem>)}</DataList> : <EmptyState title="No tienes recordatorios activos sin leer." />}
      </Surface>
    </div>
  </div>;
}

export function PlanningDashboard({ panel }: { panel: PlanningPanel }) {
  return <div className="dashboard-stack">
    <section aria-label="Oportunidades" className="dashboard-section">
      <h2>Oportunidades</h2><div className="dashboard-metrics">
        <MetricCard label="Pendientes de revisión" value={panel.opportunities.pendingReview} to="/opportunities?status=PENDING_REVIEW" description="Nuevas oportunidades que esperan revisión" />
        <MetricCard label="En preparación" value={panel.opportunities.preparing} to="/opportunities?status=PREPARING" />
      </div>
    </section>
    <div className="dashboard-columns">
      <Surface heading={`Fechas límite en los próximos 30 días (${panel.deadlinesInNext30Days})`}>
        {panel.upcomingDeadlines.length ? <DataList>{panel.upcomingDeadlines.map(row => <DataListItem key={row.id}>
          <ActionLink appearance="list" to={`/opportunities/${row.id}`}>{row.name}</ActionLink>
          <Metadata items={[{ label: 'Fecha límite', value: <time className="dashboard-deadline" dateTime={row.deadline}>
            {new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(`${row.deadline}T00:00:00.000Z`))}
          </time> }]} />
        </DataListItem>)}</DataList> : <EmptyState title="No hay fechas límite dentro de los próximos 30 días." />}
      </Surface>
      <Surface heading={`Reuniones relacionadas (${panel.upcomingMeetingCount})`} actions={<ActionLink appearance="context" to="/meetings">Ver reuniones</ActionLink>}>
        <MeetingList rows={panel.upcomingMeetings} />
      </Surface>
    </div>
  </div>;
}
