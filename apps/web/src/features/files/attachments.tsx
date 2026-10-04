import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest, ApiError } from '../../lib/api/client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { buttonClass, MutationError, Pagination, QueryState } from '../directory/directory-ui';
import { timelineIdentityKey } from '../relationships/timeline-queries';
import { canReadFiles, fileIdentityKey, useAttachments, useFileLimits } from './queries';
import { EXTENSIONS, fileMetadataSchema, selectionError } from './contracts';
type Props = { identity: AuthIdentity; resource: 'relationship-processes' | 'communications' | 'opportunities'; resourceId: string; processId?: string; blocked: boolean };
export function Attachments(props: Props) {
  if (!canReadFiles(props.identity, props.resource === 'opportunities' ? 'opportunities' : props.resource === 'communications')) return null;
  return <AttachmentPanel key={fileIdentityKey(props.identity).join(':') + ':' + props.resourceId} {...props} />;
}
function AttachmentPanel({ identity, resource, resourceId, processId, blocked }: Props) {
  const client = useQueryClient(), path = resource + '/' + resourceId + '/attachments';
  const [page, setPage] = useState(1), [selected, setSelected] = useState<File[]>([]), [validation, setValidation] = useState<string | null>(null), [inputVersion, setInputVersion] = useState(0);
  const requestKey = useRef<string | null>(null), query = useAttachments(identity, path, page), limits = useFileLimits(identity);
  const isCurrent = () => { const current = client.getQueryData<AuthIdentity | null>(AUTH_QUERY_KEY); return !!current && fileIdentityKey(current).every((value, index) => value === fileIdentityKey(identity)[index]); };
  const upload = useMutation({ retry: false, mutationFn: async () => {
    const body = new FormData(); selected.forEach(file => body.append('files', file));
    requestKey.current ??= crypto.randomUUID();
    return z.array(fileMetadataSchema).parse(await apiRequest(path, { method: 'POST', headers: { 'Idempotency-Key': requestKey.current }, body }));
  }, onSuccess: async () => {
    if (!isCurrent()) return;
    setSelected([]); setInputVersion(value => value + 1); requestKey.current = null;
    await Promise.all([client.invalidateQueries({ queryKey: [...fileIdentityKey(identity), path] }), client.invalidateQueries({ queryKey: resource === 'opportunities' ? ['opportunity-history'] : [...timelineIdentityKey(identity), processId] })]);
  }, onError: async () => {
    if (isCurrent()) await Promise.all([query.refetch(), client.invalidateQueries({ queryKey: ['relationship-processes'] }), client.invalidateQueries({ queryKey: ['communications'] }), client.invalidateQueries({ queryKey: ['opportunities'] })]);
  } });
  const download = useMutation({ mutationFn: async (file: z.infer<typeof fileMetadataSchema>) => {
    const blob = await apiRequest<Blob>('files/' + file.id + '/download', {}, 'blob');
    if (!blob || !isCurrent()) return;
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = file.originalName;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, retry: false });
  return <section id="adjuntos" aria-label="Adjuntos privados" className="min-w-0 space-y-3 rounded border p-4 break-words">
    <h2 className="text-xl font-semibold">Adjuntos privados</h2>
    {resource === 'communications' && <p>Estos archivos son incorporaciones posteriores con autor y fecha propios; no forman parte del mensaje original registrado.</p>}
    <QueryState pending={query.isPending} error={query.isError} retry={query.refetch} />
    {query.data && !query.data.total && <p>No hay adjuntos registrados.</p>}
    <ul className="space-y-3">{query.data?.items.map(file => <li key={file.id} className="space-y-1">
      <p className="font-semibold">{file.originalName} · {file.sizeBytes < 1024 ? file.sizeBytes.toLocaleString('es-BO') + ' bytes' : (file.sizeBytes / 1024).toLocaleString('es-BO', { maximumFractionDigits: 1 }) + ' KiB'}</p>
      <p>{file.uploadedBy.displayName}{!file.uploadedBy.isActive && ' (cuenta inactiva)'} · {new Date(file.createdAt).toLocaleString('es-BO')}</p>
      <button className={buttonClass} disabled={download.isPending} onClick={() => download.mutate(file)}>Descargar {file.originalName}</button>
    </li>)}</ul>
    {query.data && <Pagination page={page} total={query.data.total} onPage={setPage} />}
    {blocked ? <p>{resource === 'opportunities' ? 'La oportunidad está descartada o finalizada: se conservan los adjuntos anteriores y no se admiten nuevas cargas.' : resource === 'communications' ? 'La comunicación está invalidada: se conservan los adjuntos anteriores y no se admiten nuevas cargas.' : 'El proceso está cerrado: se conservan los adjuntos anteriores y no se admiten nuevas cargas directas.'}</p> : identity.permissions.includes('files.upload') && <form className="space-y-3" onSubmit={event => {
      event.preventDefault(); if (!limits.data) return; const error = selectionError(selected, limits.data); setValidation(error); if (!error && !upload.isPending) upload.mutate();
    }}>
      <QueryState pending={limits.isPending} error={limits.isError} retry={limits.refetch} />
      {limits.data && <p>Hasta {limits.data.maxFiles} archivos por carga, máximo {(limits.data.maxBytes / 1024 / 1024).toLocaleString('es-BO')} MiB por archivo. PDF, Office, texto, CSV e imágenes admitidas.</p>}
      <label className="block">Seleccionar archivos<input key={inputVersion} aria-label="Seleccionar archivos" className="block w-full" type="file" multiple accept={EXTENSIONS.map(value => '.' + value).join(',')} disabled={upload.isPending} onChange={event => {
        const files = Array.from(event.target.files ?? []); setSelected(files); requestKey.current = null; upload.reset(); setValidation(limits.data ? selectionError(files, limits.data) : null);
      }} /></label>
      <ul>{selected.map((file, index) => <li key={index}>{file.name} · {file.size.toLocaleString('es-BO')} bytes</li>)}</ul>
      {validation && <p role="alert">{validation}</p>}
      <button className={buttonClass} disabled={upload.isPending || !limits.data || !selected.length || !!validation}>{upload.isPending ? 'Incorporando adjuntos…' : 'Incorporar adjuntos'}</button>
    </form>}
    <MutationError error={upload.error} /><MutationError error={download.error} />
    {upload.error instanceof ApiError && upload.error.status === 409 && <button className={buttonClass} onClick={() => void query.refetch()}>Revisar adjuntos registrados</button>}
    {upload.isSuccess && isCurrent() && <p role="status">Adjuntos incorporados.</p>}
  </section>;
}
