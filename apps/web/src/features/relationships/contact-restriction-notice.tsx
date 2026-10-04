import { Link } from 'react-router';
import { buttonClass } from '../directory/directory-ui';
import type { ContactRestriction } from './restriction-contracts';
export function ContactRestrictionNotice({ restriction }: { restriction: ContactRestriction | undefined }) {
  if (!restriction) return null;
  return <aside role="alert" className="space-y-2 rounded border-2 border-red-800 bg-red-50 p-4 text-red-950">
    <p className="font-bold">RESTRICCIÓN ACTIVA — NO CONTACTAR</p><p className="whitespace-pre-wrap break-words">{restriction.reason}</p>
    <p>No se puede crear una intención, convertirla ni crear un proceso mientras siga activa.</p>
    <Link className={buttonClass} to={'/contact-restrictions/' + restriction.id}>Consultar restricción</Link>
  </aside>;
}
