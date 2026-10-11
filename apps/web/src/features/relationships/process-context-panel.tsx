import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import type { AuthIdentity } from '../auth/session';
import { Attachments } from '../files/attachments';
import { ContextMeetings } from '../meetings/meeting-components';
import { useOpportunities } from '../opportunities/queries';
import { STATUS_LABELS } from '../opportunities/contracts';
import { CommunicationsList } from '../communications/communications-list';
import { ActionLink } from '../../components/ui/actions';
import { Surface } from '../../components/ui/layout';
import { DataList, DataListItem, Pagination } from '../../components/ui/lists';
import { EmptyState, QueryFeedback, StatusBadge } from '../../components/ui/feedback';
import { PARTICIPANT_ORIGIN_LABELS, type ProcessDetail } from './process-contracts';

function ContextSection({ title, children, initiallyOpen = false, anchor }: { title: string; children: ReactNode; initiallyOpen?: boolean; anchor?: string }) {
  const [open, setOpen] = useState(initiallyOpen), [activated, setActivated] = useState(initiallyOpen);
  const location = useLocation(), section = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (anchor && location.hash === '#' + anchor && section.current) section.current.open = true;
  }, [anchor, location.hash, location.key]);
  useEffect(() => {
    if (open && activated && anchor && location.hash === '#' + anchor) section.current?.scrollIntoView?.({ block: 'start' });
  }, [open, activated, anchor, location.hash, location.key]);
  return <details ref={section} className="process-context-section" open={open} onToggle={event => {
    setOpen(event.currentTarget.open); if (event.currentTarget.open) setActivated(true);
  }}><summary>{title}</summary>{activated && <div className="process-context-content">{children}</div>}</details>;
}
function ContextOpportunities({ identity, processId }: { identity: AuthIdentity; processId: string }) {
  const [page, setPage] = useState(1);
  const query = useOpportunities(identity, 'opportunities?' + new URLSearchParams({ processId, page: String(page) }));
  return <section aria-label="Oportunidades vinculadas">
    <QueryFeedback pending={query.isPending} error={query.isError} retry={query.refetch} />
    {query.data?.total === 0 && <EmptyState title="No hay oportunidades vinculadas." />}
    <DataList>{query.data?.items.map(row => <DataListItem key={row.id}><ActionLink appearance="list" to={'/opportunities/' + row.id}>{row.name}</ActionLink><StatusBadge>{STATUS_LABELS[row.status]}</StatusBadge></DataListItem>)}</DataList>
    {query.data && <Pagination page={page} total={query.data.total} pageSize={query.data.pageSize} onPage={setPage} />}
  </section>;
}
export function ProcessContextPanel({ identity, process }: { identity: AuthIdentity; process: ProcessDetail }) {
  return <aside aria-label="Recursos del proceso" className="process-resources"><h2>Contexto del proceso</h2>
    <ContextSection title={'Participantes · ' + process.participants.length} initiallyOpen>
      <Surface aria-label="Participantes" heading="Participantes"><ul className="process-participants">{process.participants.map(participant => <li key={participant.user.id}>
        <p>{participant.user.displayName}{!participant.user.isActive && ' (cuenta inactiva)'}</p>
        <p>{PARTICIPANT_ORIGIN_LABELS[participant.origin]} · <time dateTime={participant.joinedAt}>{new Date(participant.joinedAt).toLocaleString('es-BO')}</time></p>
      </li>)}</ul></Surface>
    </ContextSection>
    {identity.permissions.includes('files.read') && <ContextSection title="Adjuntos privados" anchor="adjuntos"><Attachments modern compact identity={identity} resource="relationship-processes" resourceId={process.id} processId={process.id} blocked={process.state === 'CLOSED'} /></ContextSection>}
    {identity.permissions.includes('meetings.read') && <ContextSection title="Reuniones vinculadas"><ContextMeetings modern identity={identity} processId={process.id} /></ContextSection>}
    {(identity.permissions.includes('opportunities.read') || identity.permissions.includes('opportunities.create')) && <ContextSection title="Oportunidades vinculadas">
      {identity.permissions.includes('opportunities.create') && <ActionLink appearance="context" to={'/opportunities/new?processId=' + process.id}>Crear oportunidad desde este proceso</ActionLink>}
      {identity.permissions.includes('opportunities.read') && <ContextOpportunities identity={identity} processId={process.id} />}
    </ContextSection>}
    {identity.permissions.includes('communications.read') && <ContextSection title="Índice de comunicaciones"><CommunicationsList identity={identity} processId={process.id} /></ContextSection>}
  </aside>;
}
