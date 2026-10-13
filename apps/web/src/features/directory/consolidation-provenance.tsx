import { ActionLink } from '../../components/ui/actions';

import type { z } from 'zod';
import type { consolidationOriginSchema } from './contracts';
import { dateLabel } from './date-label';

export function ConsolidationProvenance({ origins }: { origins: z.infer<typeof consolidationOriginSchema>[] | undefined }) {
  if (!origins?.length) return null;
  return <div className="space-y-2 rounded border border-amber-400 p-3"><p className="font-semibold">Reconciliado por consolidación</p>
    <ul>{origins.map(origin => <li key={origin.source.id}>
      {dateLabel(origin.resolvedAt)} · {origin.resolvedBy?.givenNames} {origin.resolvedBy?.familyNames}.
      {' '}{origin.outcome === 'CREATED' ? 'Representación operativa añadida.' : 'Registro existente reutilizado.'}
      {origin.outcome === 'KEPT_PRINCIPAL' && ' Se conservó el contexto del principal.'}
      <ActionLink className="inline-flex min-h-11 items-center px-2" to={'/' + origin.source.path}>Consultar evidencia original: {origin.source.label}</ActionLink>
    </li>)}</ul></div>;
}
