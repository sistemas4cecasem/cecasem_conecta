import { ActionLink } from '../../components/ui/actions';

import type { ContactRestriction } from './restriction-contracts';
export function ContactRestrictionNotice({ restriction, context }: { restriction: ContactRestriction | undefined; context?: 'process' }) {
  if (!restriction) return null;
  return <aside role="alert" className="space-y-2 rounded border-2 border-red-800 bg-red-50 p-4 text-red-950">
    <p className="font-bold">RESTRICCIÓN ACTIVA — NO CONTACTAR</p><p className="whitespace-pre-wrap break-words">{restriction.reason}</p>
    <p>{context === 'process' ? 'No registrar nuevas comunicaciones enviadas mientras siga activa. Se conserva el historial y se pueden documentar comunicaciones recibidas.' : 'No se puede crear una intención, convertirla ni crear un proceso mientras siga activa.'}</p>
    <ActionLink appearance="context" to={'/contact-restrictions/' + restriction.id}>Consultar restricción</ActionLink>
  </aside>;
}
