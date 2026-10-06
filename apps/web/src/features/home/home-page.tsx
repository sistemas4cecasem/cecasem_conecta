import { Link } from 'react-router';
import { useSession } from '../auth/session';
import { useDashboard } from './dashboard-queries';

const cardClass = 'min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm';
const linkClass = 'font-medium text-teal-800 underline underline-offset-2';
function Metric({ label, value, to, detail }: { label: string; value: number; to: string; detail?: string }) {
  return <Link to={to} className={`${cardClass} block transition hover:border-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800`}>
    <span className="block text-sm text-slate-600">{label}</span><span className="mt-1 block text-3xl font-semibold tabular-nums text-slate-950">{value}</span>
    {detail && <span className="mt-1 block text-sm text-slate-600">{detail}</span>}
  </Link>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3"><h2 className="text-lg font-semibold text-slate-900">{title}</h2>{children}</section>;
}
function MeetingList({ rows }: { rows: { id: string; purpose: string; scheduledAt: string; timezone: string; relatedTitle: string | null }[] }) {
  if (!rows.length) return <p className="text-sm text-slate-600">No hay reuniones próximas.</p>;
  return <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">{rows.map(row => <li key={row.id} className="min-w-0 p-4">
    <Link className={linkClass} to={`/meetings/${row.id}`}>{row.purpose}</Link>
    <p className="mt-1 break-words text-sm text-slate-700">{new Date(row.scheduledAt).toLocaleString('es-BO', { timeZone: row.timezone, dateStyle: 'medium', timeStyle: 'short' })} · {row.timezone}</p>
    {row.relatedTitle && <p className="mt-1 break-words text-sm text-slate-600">Relacionado con: {row.relatedTitle}</p>}
  </li>)}</ul>;
}
function DateLabel({ date }: { date: string }) {
  return <time dateTime={date}>{new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(`${date}T00:00:00.000Z`))}</time>;
}

export function HomePage() {
  const identity = useSession().data;
  if (!identity?.permissions.includes('relationships.process.read')) return <p role="alert">No tienes permiso para consultar el panel.</p>;
  return <DashboardHome identity={identity} />;
}

function DashboardHome({ identity }: { identity: NonNullable<ReturnType<typeof useSession>['data']> }) {
  const query = useDashboard(identity);
  return <section className="mx-auto w-full max-w-6xl min-w-0 space-y-8 px-1 py-2 sm:px-3" aria-labelledby="home-title">
    <header><p className="text-sm font-semibold tracking-widest text-teal-800">CECASEM CONECTA</p><h1 id="home-title" className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Panel institucional</h1>
      {query.data && <p className="mt-2 text-sm text-slate-600">Actualizado {new Date(query.data.asOf).toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
    </header>
    {query.isPending && <p role="status" className="rounded border border-slate-200 bg-white p-4">Cargando indicadores…</p>}
    {query.isError && <div role="alert" className="rounded border border-red-300 bg-white p-4"><p>No se pudo cargar el panel.</p><button className="mt-2 min-h-11 underline" onClick={() => void query.refetch()}>Reintentar</button></div>}
    {query.data?.view === 'institutional' && <div className="space-y-8">
      <Section title="Procesos y oportunidades"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Procesos activos" value={query.data.activeProcesses} to="/relationship-processes" />
        <Metric label="Esperando respuesta" value={query.data.waitingResponseProcesses} to="/relationship-processes?state=WAITING_RESPONSE" />
        <Metric label="Pendientes de revisión" value={query.data.opportunities.pendingReview} to="/opportunities?status=PENDING_REVIEW" />
        <Metric label="En preparación" value={query.data.opportunities.preparing} to="/opportunities?status=PREPARING" />
        <Metric label="Postulaciones pendientes" value={query.data.pendingApplications} to="/opportunities?status=SUBMITTED" detail="Postuladas que aún no están finalizadas" />
      </div></Section>
      <Section title="Directorio"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Metric label="Requieren revisión" value={query.data.organizationsReviewDue} to="/organizations?status=active&verificationStatus=REVIEW_DUE" />
        <Metric label="Nunca verificadas" value={query.data.organizationsNeverVerified} to="/organizations?status=active&verificationStatus=NEVER_VERIFIED" />
      </div></Section>
      <Section title={`Reuniones próximas (${query.data.upcomingMeetingCount})`}><MeetingList rows={query.data.upcomingMeetings} /><Link className={linkClass} to="/meetings">Ver reuniones</Link></Section>
    </div>}
    {query.data?.view === 'research' && <div className="space-y-8">
      <Section title="Procesos activos relevantes"><Metric label="Tus procesos activos" value={query.data.activeProcesses} to="/relationship-processes" />
        {query.data.relevantProcesses.length ? <ul className="space-y-2">{query.data.relevantProcesses.map(row => <li className={cardClass} key={row.id}><Link className={linkClass} to={`/relationship-processes/${row.id}`}>{row.purpose}</Link><p className="mt-1 text-sm text-slate-600">{row.target ?? 'Sin organización o persona indicada'} · {new Date(row.lastActivityAt).toLocaleDateString('es-BO')}</p></li>)}</ul> : <p className="text-sm text-slate-600">No tienes procesos activos relevantes.</p>}
      </Section>
      <Section title={`Intenciones activas (${query.data.activeIntents})`}>
        {query.data.relevantIntents.length ? <ul className="space-y-2">{query.data.relevantIntents.map(row => <li className={cardClass} key={row.id}><Link className={linkClass} to={`/contact-intents/${row.id}`}>{row.purpose}</Link><p className="mt-1 text-sm text-slate-600">{row.target ?? 'Sin organización o persona indicada'}</p></li>)}</ul> : <p className="text-sm text-slate-600">No tienes intenciones activas.</p>}
        <Link className={linkClass} to="/contact-intents">Ver intenciones</Link>
      </Section>
      <Section title={`Recordatorios sin leer (${query.data.unreadReminders})`}>
        {query.data.reminderItems.length ? <ul className="space-y-2">{query.data.reminderItems.map(row => <li className={cardClass} key={row.id}><Link className={linkClass} to={row.processId ? `/relationship-processes/${row.processId}` : row.intentId ? `/contact-intents/${row.intentId}` : '/notifications'}>{row.subject}</Link><p className="mt-1 text-sm text-slate-600">{new Date(row.createdAt).toLocaleDateString('es-BO')}</p></li>)}</ul> : <p className="text-sm text-slate-600">No tienes recordatorios activos sin leer.</p>}
        <Link className={linkClass} to="/notifications">Ver notificaciones</Link>
      </Section>
    </div>}
    {query.data?.view === 'planning' && <div className="space-y-8">
      <Section title="Oportunidades"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Pendientes de revisión" value={query.data.opportunities.pendingReview} to="/opportunities?status=PENDING_REVIEW" detail="Nuevas oportunidades que esperan revisión" />
        <Metric label="En preparación" value={query.data.opportunities.preparing} to="/opportunities?status=PREPARING" />
      </div></Section>
      <Section title={`Fechas límite en los próximos 30 días (${query.data.deadlinesInNext30Days})`}>
        {query.data.upcomingDeadlines.length ? <ul className="space-y-2">{query.data.upcomingDeadlines.map(row => <li className={cardClass} key={row.id}><Link className={linkClass} to={`/opportunities/${row.id}`}>{row.name}</Link><p className="mt-1 text-sm text-slate-700">Fecha límite: <DateLabel date={row.deadline} /></p></li>)}</ul> : <p className="text-sm text-slate-600">No hay fechas límite dentro de los próximos 30 días.</p>}
      </Section>
      <Section title={`Reuniones relacionadas (${query.data.upcomingMeetingCount})`}><MeetingList rows={query.data.upcomingMeetings} /><Link className={linkClass} to="/meetings">Ver reuniones</Link></Section>
    </div>}
  </section>;
}
