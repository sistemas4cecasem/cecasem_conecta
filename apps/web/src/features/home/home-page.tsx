import { PageHeader } from '../../components/ui/layout';
import { Metadata } from '../../components/ui/lists';
import { QueryFeedback } from '../../components/ui/feedback';
import { useSession } from '../auth/session';
import { useDashboard } from './dashboard-queries';
import { InstitutionalDashboard, PlanningDashboard, ResearchDashboard } from './dashboard-views';
import './dashboard.css';

export function HomePage() {
  const identity = useSession().data;
  if (!identity?.permissions.includes('relationships.process.read')) return <p role="alert">No tienes permiso para consultar el panel.</p>;
  return <DashboardHome identity={identity} />;
}

function DashboardHome({ identity }: { identity: NonNullable<ReturnType<typeof useSession>['data']> }) {
  const query = useDashboard(identity);
  return <section className="dashboard" aria-label="Panel institucional">
    <PageHeader eyebrow="CECASEM CONECTA" title="Panel institucional" metadata={query.data &&
      <Metadata items={[{ label: 'Actualizado', value: <time dateTime={query.data.asOf}>
        {new Date(query.data.asOf).toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' })}
      </time> }]} />} />
    <QueryFeedback pending={query.isPending} pendingMessage="Cargando indicadores…" error={query.isError}
      errorMessage="No se pudo cargar el panel." retry={query.refetch} />
    {query.data?.view === 'institutional' && <InstitutionalDashboard panel={query.data} />}
    {query.data?.view === 'research' && <ResearchDashboard panel={query.data} />}
    {query.data?.view === 'planning' && <PlanningDashboard panel={query.data} />}
  </section>;
}
