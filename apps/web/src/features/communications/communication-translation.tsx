import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest } from '../../lib/api/client';
import type { AuthIdentity } from '../auth/session';
import { AUTH_QUERY_KEY } from '../auth/session';
import { buttonClass } from '../directory/directory-ui';
import { communicationIdentityKey } from './queries';
const translationSchema = z.object({ id:z.string().uuid(), communicationId:z.string().uuid(), targetLanguage:z.literal('es'),
  detectedSourceLanguage:z.string().nullable(), translatedText:z.string().min(1), createdAt:z.string().datetime() });
function translationIdentityKey(identity: AuthIdentity) { return [...communicationIdentityKey(identity),identity.permissions.filter(permission=>permission.startsWith('translations.')).sort().join(',')]; }
export function CommunicationTranslation({ identity, id, body }: { identity: AuthIdentity; id: string; body: string }) {
  const client = useQueryClient(), permitted = identity.permissions.includes('translations.read');
  const key = ['communication-translation',...translationIdentityKey(identity),id];
  const path = 'communications/' + id + '/translations/spanish';
  const query = useQuery({ queryKey:key, enabled:permitted, retry:false, queryFn:async ({signal}) => translationSchema.nullable().parse(await apiRequest(path,{signal})) });
  const mutation = useMutation({ mutationFn:async () => translationSchema.parse(await apiRequest(path,{method:'POST'})), retry:false,
    onSuccess:row => { const current = client.getQueryData<AuthIdentity | null>(AUTH_QUERY_KEY);
      if (current && translationIdentityKey(current).join(':') === translationIdentityKey(identity).join(':')) client.setQueryData(key,row);
    } });
  if (!permitted) return null;
  return <section aria-label="Traducción al español" className="space-y-3 rounded border p-4">
    <h2 className="font-semibold">Traducción al español</h2>
    <p>Representación de apoyo. El cuerpo original permanece disponible arriba; las correcciones se muestran por separado.</p>
    {query.isPending && <p role="status">Consultando traducción guardada…</p>}
    {query.isError && <><p role="alert">No se pudo consultar la traducción guardada. El original continúa disponible.</p><button className={buttonClass} onClick={() => void query.refetch()}>Reintentar consulta</button></>}
    {query.data && <><pre className="whitespace-pre-wrap break-words font-sans">{query.data.translatedText}</pre><p>Generada: {new Date(query.data.createdAt).toLocaleString('es-BO')}</p></>}
    {!query.isPending && !query.isError && !query.data && <>
      {!body.trim() ? <p>Este registro no tiene texto para traducir.</p> : identity.permissions.includes('translations.request') && <button className={buttonClass} disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Traduciendo…' : mutation.isError ? 'Reintentar traducción' : 'Traducir al español'}</button>}
      {mutation.isPending && <p role="status">El original continúa disponible mientras se genera la traducción.</p>}
      {mutation.isError && <p role="alert">{mutation.error.message}</p>}
    </>}
  </section>;
}
