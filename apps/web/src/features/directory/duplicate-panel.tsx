import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { AuthIdentity } from '../auth/session';
import { apiRequest } from '../../lib/api/client';
import { useDirectoryMutation } from './queries';
import { buttonClass, MutationError, Pagination, QueryState } from './directory-ui';
import { dateLabel } from './date-label';
import { duplicateActorLabel, duplicatePageSchema, type DuplicateActor, type DuplicateCandidate } from './duplicates.contracts';
import { ConsolidationReview } from './consolidation-review';

const signalLabels: Record<string, string> = { SIMILAR_ORGANIZATION_NAMES: 'Nombres o siglas próximos', SIMILAR_PERSON_NAMES: 'Nombres próximos',
  COMPATIBLE_INITIALS: 'Iniciales compatibles: requieren revisión', DIFFERENT_COUNTRIES: 'Países diferentes: comprobar contexto',
  REVIEW_PARENT_OFFICE_CONTEXT: 'Revisar matriz y sede: pueden ser organizaciones distintas' };
function ComparisonActor({ actor, kind }: { actor: DuplicateActor; kind: DuplicateCandidate['kind'] }) {
  return <div className="min-w-0 space-y-2 rounded border p-3">
    <Link className="inline-flex min-h-11 items-center underline" to={'/' + (kind === 'person' ? 'people/' : 'organizations/') + actor.id}>{duplicateActorLabel(actor)}</Link>
    <p>{actor.isActive ? 'Ficha activa' : 'Ficha inactiva'} · Versión {actor.version}</p>
    {kind === 'organization' ? <><p>País: {actor.country ?? 'Sin dato'}</p><p>Sigla: {actor.alias ?? 'Sin dato'}</p><p>Matriz: {actor.parent?.name ?? 'Sin matriz'}</p></>
      : <><p>Nombres: {actor.givenNames ?? 'Sin dato'}</p><p>Apellidos: {actor.familyNames ?? 'Sin dato'}</p></>}
    <p>Última verificación: {dateLabel(actor.lastVerifiedAt)}. No es una prueba de identidad.</p>
  </div>;
}
function CandidateReview({ candidate, identity, reevaluate }: { candidate: DuplicateCandidate; identity: AuthIdentity; reevaluate: () => Promise<unknown> }) {
  const [comparing, setComparing] = useState(false), [administering, setAdministering] = useState(false);
  const mutation = useDirectoryMutation(identity);
  return <article className="space-y-3 rounded border border-amber-300 bg-amber-50 p-4">
    <h3 className="font-semibold">Posible coincidencia: {duplicateActorLabel(candidate.a)} / {duplicateActorLabel(candidate.b)}</h3>
    <p>Similitud de nombres: {Math.round(candidate.score * 100)} %. Una persona autorizada debe decidir si son el mismo actor.</p>
    <ul className="list-inside list-disc">{candidate.signals.map(signal => <li key={signal}>{signalLabels[signal] ?? 'Revisar contexto de la coincidencia'}</li>)}</ul>
    {candidate.stale && <p role="status">Esta coincidencia está desactualizada. Reevalúa y utiliza la advertencia de las versiones actuales.</p>}
    <div className="flex flex-wrap gap-3"><button className={buttonClass} onClick={() => setComparing(!comparing)}>{comparing ? 'Cerrar comparación' : 'Comparar fichas'}</button>
      {identity.permissions.includes('directory.duplicates.dismiss') && <button className={buttonClass} disabled={candidate.stale || mutation.isPending}
        onClick={() => { void mutation.mutateAsync({ path: 'duplicate-candidates/' + candidate.id + '/dismiss', method: 'POST', body: {
          expectedCandidateVersion: candidate.version, expectedVersionA: candidate.examinedVersionA, expectedVersionB: candidate.examinedVersionB,
        } }).catch(() => undefined); }}>No son duplicados</button>}
      {identity.permissions.includes('directory.duplicates.manage') && <button className={buttonClass} disabled={candidate.stale || mutation.isPending}
        onClick={() => setAdministering(!administering)}>Revisar consolidación</button>}
      {candidate.stale && <button className={buttonClass} onClick={() => { void reevaluate(); }}>Reevaluar coincidencias</button>}</div>
    <MutationError error={mutation.error} reload={async () => { await reevaluate(); mutation.reset(); }} />
    {comparing && <div className="grid gap-3 md:grid-cols-2"><ComparisonActor actor={candidate.a} kind={candidate.kind} /><ComparisonActor actor={candidate.b} kind={candidate.kind} /></div>}
    {administering && <ConsolidationReview identity={identity} candidate={candidate} completed={() => setAdministering(false)} />}
  </article>;
}
export function DuplicatePanel({ identity, actorPath, hideEmptyPagination = false }: { identity: AuthIdentity; actorPath: string; hideEmptyPagination?: boolean }) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['directory', identity.id, 'duplicates', actorPath, page], enabled: identity.permissions.includes('directory.read'),
    queryFn: async ({ signal }) => duplicatePageSchema.parse(await apiRequest(actorPath + '/duplicate-candidates?page=' + page, { signal })), retry: false });
  return <section className="min-w-0 space-y-3" aria-label="Posibles duplicados"><h2 className="text-xl font-semibold">Posibles duplicados</h2>
    <QueryState pending={query.isPending} error={query.isError} retry={query.refetch} />
    {query.data && !query.data.items.some(item => item.state === 'PENDING') && <p>No hay coincidencias pendientes en esta página.</p>}
    {query.data?.items.filter(item => item.state === 'PENDING').map(candidate => <CandidateReview key={candidate.id + '-' + candidate.version}
      candidate={candidate} identity={identity} reevaluate={query.refetch} />)}
    {query.data?.items.some(item => item.state !== 'PENDING') && <details className="rounded border p-3"><summary className="min-h-11 cursor-pointer">Decisiones anteriores</summary>
      <ul className="space-y-3">{query.data.items.filter(item => item.state !== 'PENDING').map(item => <li key={item.id}>
        {duplicateActorLabel(item.a)} / {duplicateActorLabel(item.b)}: {item.state === 'NOT_DUPLICATE' ? 'No son duplicados' : 'Consolidados'}.
        {' '}{item.resolvedBy?.givenNames} {item.resolvedBy?.familyNames} · {dateLabel(item.resolvedAt)} · Versiones examinadas {item.examinedVersionA}/{item.examinedVersionB}.
        {item.principalId && <Link className="inline-flex min-h-11 underline" to={'/' + (item.kind === 'person' ? 'people/' : 'organizations/') + item.principalId}>Abrir principal</Link>}
      </li>)}</ul></details>}
    {query.data && (!hideEmptyPagination || query.data.total > 0) && <Pagination page={page} total={query.data.total} onPage={setPage} />}
  </section>;
}
