import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { apiRequest } from '../../lib/api/client';
import { useAdministrationAction } from './use-administration-action';

const issuedSchema = z.object({ token: z.string(), expiresAt: z.string() });
export function TemporaryCredential({ userId, kind }: { userId: string; kind: 'first-access' | 'password-reset' }) {
  const [issued, setIssued] = useState<z.infer<typeof issuedSchema> | null>(null);
  const [copied, setCopied] = useState(false);
  const request = useRef<AbortController | null>(null);
  const action = useAdministrationAction();
  useEffect(() => () => { request.current?.abort(); }, []);
  const label = kind === 'first-access' ? 'Generar primer acceso' : 'Iniciar restablecimiento';
  const link = issued ? `${window.location.origin}/${kind === 'first-access' ? 'first-access' : 'reset-password'}#token=${issued.token}` : '';
  return <div>
    <button className="min-h-11 rounded border px-3" disabled={action.pending} onClick={() => void action.run(async () => {
      setIssued(null); setCopied(false);
      const controller = new AbortController(); request.current = controller;
      const credential = issuedSchema.parse(await apiRequest(`auth/${kind}-tokens`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }), signal: controller.signal,
      }));
      if (!controller.signal.aborted) setIssued(credential);
    })}>{action.pending ? 'Generando…' : label}</button>
    {action.error && <p role="alert">{action.error}</p>}
    {issued && <section aria-label="Credencial temporal" className="my-3 rounded border p-3">
      <p>Entrega este enlace por un canal verificado. Se muestra solo aquí; si lo pierdes, genera uno nuevo.</p>
      <p className="break-all">{link}</p><p>Caduca: {new Date(issued.expiresAt).toLocaleString()}</p>
      <button className="min-h-11 underline" onClick={() => void action.run(async () => { await navigator.clipboard.writeText(link); setCopied(true); })}>Copiar enlace</button>
      {copied && <p role="status">Enlace copiado.</p>}
      <button className="ml-4 min-h-11 underline" onClick={() => { setIssued(null); setCopied(false); }}>Cerrar credencial</button>
    </section>}
  </div>;
}
