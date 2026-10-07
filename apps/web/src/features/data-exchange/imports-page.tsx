import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '../../lib/api/client';
import { useSession } from '../auth/session';

type Kind = 'ORGANIZATION' | 'PERSON' | 'CONTACT' | 'HISTORICAL_RECORD';
type Header = { column: number; value: string | number | boolean | null; cellType: string };
type PreviewRow = { rowNumber: number; status: 'READY' | 'NEEDS_REVIEW' | 'INVALID' | 'IMPORTED'; sourceValues: Record<string, unknown>; normalizedValues: Record<string, unknown> | null;
  errors: { field: string | null; message: string; value: string | null }[]; warnings: { field: string | null; message: string; value: string | null }[];
  matches: { field?: string; kind: string; id: string; label: string; score: number | null }[] };
type Batch = { id: string; originalFilename: string; worksheetName: string; recordKind: Kind; status: string; analyzedRows: number; readyRows: number; reviewRows: number; invalidRows: number; importedRows: number;
  rows: PreviewRow[]; page: number; pageSize: number; total?: number };
type BatchList = { items: Omit<Batch, 'rows' | 'page' | 'pageSize'>[]; total: number; page: number; pageSize: number };
type Inspection = { sheets: { name: string; rowCount: number; columnCount: number; sample: { rowNumber: number; cells: Header[] }[] }[] };
const fieldOptions: Record<Kind, { key: string; label: string }[]> = {
  ORGANIZATION: [{ key: 'name', label: 'Nombre de organización (obligatorio)' }, { key: 'country', label: 'País' }, { key: 'alias', label: 'Alias' }, { key: 'description', label: 'Descripción' }, { key: 'officialWebsite', label: 'Sitio oficial' }],
  PERSON: [{ key: 'displayName', label: 'Nombre de presentación' }, { key: 'givenNames', label: 'Nombres' }, { key: 'familyNames', label: 'Apellidos' }],
  CONTACT: [{ key: 'contactType', label: 'Tipo de contacto (obligatorio)' }, { key: 'contactValue', label: 'Valor de contacto (obligatorio)' }, { key: 'organizationName', label: 'Organización vinculada' }, { key: 'personDisplayName', label: 'Persona vinculada' }, { key: 'label', label: 'Etiqueta' }, { key: 'notes', label: 'Notas' }],
  HISTORICAL_RECORD: [{ key: 'kind', label: 'Tipo histórico (SENT/RECEIVED/OTHER/UNKNOWN)' }, { key: 'occurredOn', label: 'Fecha civil (AAAA-MM-DD)' }, { key: 'email', label: 'Correo exacto' }, { key: 'subject', label: 'Asunto' }, { key: 'body', label: 'Cuerpo conocido' }, { key: 'originalObservation', label: 'Observación original' }, { key: 'organizationName', label: 'Organización vinculada' }, { key: 'personDisplayName', label: 'Persona vinculada' }],
};
const kindLabels: Record<Kind, string> = { ORGANIZATION: 'Organizaciones', PERSON: 'Personas', CONTACT: 'Contactos', HISTORICAL_RECORD: 'Antecedentes históricos' };
const headerLabel = (cell: Header) => String(cell.value ?? '').trim() || `Columna ${cell.column}`;
function decisionFieldsFor(row: PreviewRow): string[] {
  const exactCounts = new Map<string, number>();
  for (const match of row.matches) if (match.field && match.kind === 'EXACT') exactCounts.set(match.field, (exactCounts.get(match.field) ?? 0) + 1);
  return [...new Set(row.matches.flatMap(match => match.field && (match.kind === 'POSSIBLE' || (match.kind === 'EXACT' && (exactCounts.get(match.field) ?? 0) > 1)) ? [match.field] : []))];
}
function previewFieldLabel(kind: Kind, field: string): string {
  if (field === 'organizationName') return kind === 'ORGANIZATION' ? 'Organización' : 'Organización vinculada';
  if (field === 'personDisplayName') return kind === 'PERSON' ? 'Persona' : 'Persona vinculada';
  if (field === 'contactValue') return 'Valor de contacto';
  return fieldOptions[kind].find(option => option.key === field)?.label.replace(/\s+\(obligatorio\)$/u, '') ?? field;
}
function statusLabel(status: string): string {
  return ({ ANALYZED: 'Analizado', READY: 'Lista', NEEDS_REVIEW: 'Revisión', INVALID: 'Inválida', IMPORTED: 'Importada', FAILED: 'Fallido' } as Record<string, string>)[status] ?? status;
}

export function ImportsPage() {
  const identity = useSession().data; const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null); const [inspection, setInspection] = useState<Inspection | null>(null);
  const [kind, setKind] = useState<Kind>('ORGANIZATION'); const [worksheetName, setWorksheetName] = useState(''); const [headerRow, setHeaderRow] = useState(1);
  const [mapping, setMapping] = useState<Record<string, number>>({}); const [batch, setBatch] = useState<Batch | null>(null); const [decisions, setDecisions] = useState<Record<string, string>>({});
  const batches = useQuery({ queryKey: ['data-exchange', identity?.id, 'imports'], enabled: !!identity?.permissions.includes('data_exchange.import.execute'), retry: false,
    queryFn: async ({ signal }) => apiRequest<BatchList>('data-exchange/imports?page=1&pageSize=25', { signal }) });
  const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const sheet = inspection?.sheets.find(item => item.name === worksheetName);
  const headers = useMemo(() => sheet?.sample.find(row => row.rowNumber === headerRow)?.cells ?? [], [sheet, headerRow]);
  const selectedColumns = new Set(Object.values(mapping).filter(Boolean));
  const unresolvedDecisions = batch?.rows.flatMap(row => row.status === 'IMPORTED' ? [] : decisionFieldsFor(row).filter(field => !decisions[`${row.rowNumber}:${field}`])) ?? [];
  async function openBatch(id: string) {
    setPending(true); setError('');
    try { const result = await apiRequest<Batch>(`data-exchange/imports/${id}?page=1&pageSize=50`); if (result) setBatch(result); }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : 'No se pudo consultar el lote.'); }
    finally { setPending(false); }
  }
  if (!identity?.permissions.includes('data_exchange.import.execute')) return <p role="alert">No tienes permiso para importar archivos históricos.</p>;

  async function inspect() {
    if (!file) return;
    setPending(true); setError(''); setBatch(null);
    try { const form = new FormData(); form.set('file', file); const result = await apiRequest<Inspection>('data-exchange/imports/inspect', { method: 'POST', body: form });
      if (!result) throw new Error('No se recibió la estructura del libro.'); setInspection(result); const first = result.sheets[0]; setWorksheetName(first?.name ?? ''); setHeaderRow(1); setMapping({});
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : 'No se pudo inspeccionar el archivo XLSX.'); }
    finally { setPending(false); }
  }
  async function preview() {
    if (!file) return;
    setPending(true); setError('');
    try { const form = new FormData(); form.set('file', file); form.set('worksheetName', worksheetName); form.set('headerRow', String(headerRow)); form.set('recordKind', kind); form.set('columnMapping', JSON.stringify(mapping));
      const result = await apiRequest<Batch>('data-exchange/imports/preview', { method: 'POST', body: form }); if (!result) throw new Error('No se recibió el preview.'); setBatch(result); setDecisions({});
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : 'No se pudo analizar el libro.'); }
    finally { setPending(false); }
  }
  async function confirm() {
    if (!batch) return; setPending(true); setError('');
    try { const rowDecisions = Object.entries(decisions).map(([key, value]) => { const [rowNumber, field] = key.split(':'); return { rowNumber: Number(rowNumber), field, ...(value === 'CREATE_NEW' ? { decision: 'CREATE_NEW' } : { decision: 'LINK_EXISTING', targetId: value }) }; });
      await apiRequest(`data-exchange/imports/${batch.id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decisions: rowDecisions }) });
      const result = await apiRequest<Batch>(`data-exchange/imports/${batch.id}?page=1&pageSize=50`); if (result) setBatch(result);
      await queryClient.invalidateQueries({ queryKey: ['data-exchange', identity?.id, 'imports'] });
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : 'No se pudo aplicar el lote.'); }
    finally { setPending(false); }
  }
  return <section aria-label="Importación Excel histórica" className="min-w-0 space-y-6 break-words">
    <h1 className="text-2xl font-semibold">Importación Excel histórica</h1>
    <p>Solo se aceptan archivos XLSX. La inspección no los almacena y el preview solo guarda el análisis; la confirmación es una acción distinta que escribe datos.</p>
    <section className="space-y-4 rounded border p-4" aria-label="Seleccionar y analizar archivo">
      <label className="block">Archivo XLSX<input className="mt-1 block w-full" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => { setFile(event.target.files?.[0] ?? null); setInspection(null); setBatch(null); }} /></label>
      <button className="min-h-11 rounded border px-3" disabled={!file || pending} onClick={() => void inspect()}>{pending ? 'Analizando…' : 'Inspeccionar archivo'}</button>
      {inspection && <>
        <label className="block">Hoja<select className="mt-1 block min-h-11 w-full rounded border p-2" value={worksheetName} onChange={event => { setWorksheetName(event.target.value); setHeaderRow(1); setMapping({}); }}>
          {inspection.sheets.map(item => <option key={item.name} value={item.name}>{item.name} · {item.rowCount} filas</option>)}</select></label>
        <label className="block">Fila de encabezados<select className="mt-1 block min-h-11 w-full rounded border p-2" value={headerRow} onChange={event => { setHeaderRow(Number(event.target.value)); setMapping({}); }}>
          {sheet?.sample.map(row => <option key={row.rowNumber} value={row.rowNumber}>Fila {row.rowNumber}: {row.cells.map(headerLabel).join(' · ')}</option>)}</select></label>
        <label className="block">Tipo de datos<select className="mt-1 block min-h-11 w-full rounded border p-2" value={kind} onChange={event => { setKind(event.target.value as Kind); setMapping({}); }}>
          {Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <p className="text-sm text-slate-700">Mapea solo las columnas que correspondan. Deja las demás en «Sin asignar» para ignorarlas como datos de negocio; sus valores originales se conservan y aparecerán como advertencia en el preview.</p>
        <div className="grid gap-3 sm:grid-cols-2">{fieldOptions[kind].map(field => <label key={field.key} className="block">{field.label}<select className="mt-1 block min-h-11 w-full rounded border p-2" value={mapping[field.key] ?? ''} onChange={event => setMapping(current => { const next = { ...current }; if (event.target.value) next[field.key] = Number(event.target.value); else delete next[field.key]; return next; })}>
          <option value="">Sin asignar</option>{headers.map(header => <option key={header.column} disabled={selectedColumns.has(header.column) && mapping[field.key] !== header.column} value={header.column}>Columna {header.column}: {headerLabel(header)}</option>)}</select></label>)}</div>
        <button className="min-h-11 rounded border px-3" disabled={pending || !headers.length} onClick={() => void preview()}>{pending ? 'Creando preview…' : 'Analizar y crear preview'}</button>
      </>}
    </section>
    {batches.data && batches.data.items.length > 0 && <section className="space-y-3 rounded border p-4" aria-label="Lotes anteriores"><h2 className="text-xl font-semibold">Lotes anteriores · {batches.data.total}</h2>
      <ul className="space-y-2">{batches.data.items.map(item => <li key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded border p-3"><span className="break-all">{item.originalFilename} · {statusLabel(item.status)} · {item.importedRows}/{item.analyzedRows}</span><button className="min-h-11 rounded border px-3" disabled={pending} onClick={() => void openBatch(item.id)}>Ver lote</button></li>)}</ul>
    </section>}
    {error && <p role="alert" className="rounded border border-red-600 p-3">{error}</p>}
    {batch && <section className="min-w-0 space-y-4 rounded border p-4" aria-label="Preview del lote">
      <h2 className="text-xl font-semibold">{batch.status === 'IMPORTED' ? 'Resultado del lote' : 'Revisión previa a importar'}</h2>
      <p>Archivo: {batch.originalFilename} · {kindLabels[batch.recordKind]}</p><p>Lote: {batch.id} · Estado: {statusLabel(batch.status)}</p>
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[['Filas analizadas', batch.analyzedRows], ['Listas', batch.readyRows], ['Revisión', batch.reviewRows], ['Inválidas', batch.invalidRows], ['Importadas', batch.importedRows]].map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd>{value}</dd></div>)}</dl>
      {batch.status === 'ANALYZED' && <p className="text-sm text-slate-700">Las filas en «Revisión» contienen advertencias o coincidencias. Las posibles coincidencias requieren una decisión antes de escribir los datos; las filas inválidas no se importan.</p>}
      {batch.status === 'ANALYZED' && unresolvedDecisions.length > 0 && <p role="status">Resuelve {unresolvedDecisions.length} {unresolvedDecisions.length === 1 ? 'coincidencia' : 'coincidencias'} pendiente{unresolvedDecisions.length === 1 ? '' : 's'} para habilitar la importación.</p>}
      <ul className="space-y-3">{batch.rows.map(row => <li key={row.rowNumber} className="min-w-0 space-y-2 rounded border p-3"><h3 className="font-semibold">Fila {row.rowNumber} · {statusLabel(row.status)}</h3>
        <dl className="grid gap-1 sm:grid-cols-2">{Object.entries(row.normalizedValues ?? row.sourceValues).map(([field, value]) => <div key={field}><dt className="font-medium">{row.normalizedValues ? previewFieldLabel(batch.recordKind, field) : field}</dt><dd>{value === null || value === '' ? 'Sin dato' : String(value)}</dd></div>)}</dl>
        {row.errors.map((item, index) => <p key={`e${index}`} role="alert">{item.field ? `${item.field}: ` : ''}{item.message}</p>)}
        {row.warnings.map((item, index) => <p key={`w${index}`}>Advertencia{item.field ? ` · ${item.field}` : ''}: {item.message}</p>)}
        {row.matches.map((match, index) => <div key={`${match.id}:${index}`} className="rounded border p-2"><p>{match.kind === 'POSSIBLE' ? 'Posible coincidencia' : match.kind === 'EXACT' ? 'Coincidencia exacta' : 'El medio de contacto ya existe'}: {match.label}{match.score !== null ? ` · ${Math.round(match.score * 100)}%` : ''}</p></div>)}
        {row.status !== 'IMPORTED' && decisionFieldsFor(row).map(field => {
          const candidates = row.matches.filter(match => match.field === field && (match.kind === 'POSSIBLE' || match.kind === 'EXACT'));
          return <label key={field} className="block">Decisión para {previewFieldLabel(batch.recordKind, field)}<select className="mt-1 block min-h-11 w-full rounded border p-2" value={decisions[`${row.rowNumber}:${field}`] ?? ''} onChange={event => setDecisions(current => ({ ...current, [`${row.rowNumber}:${field}`]: event.target.value }))}>
            <option value="">Selecciona una decisión</option><option value="CREATE_NEW">Crear una ficha nueva, sin fusionar</option>{candidates.map(candidate => <option key={candidate.id} value={candidate.id}>Relacionar con {candidate.label}{candidate.kind === 'POSSIBLE' && candidate.score !== null ? ` · ${Math.round(candidate.score * 100)}%` : ''}</option>)}</select></label>;
        })}
      </li>)}</ul>
      {batch.status === 'ANALYZED' && <button className="min-h-11 rounded border border-blue-700 px-4 font-semibold" disabled={pending || batch.readyRows + batch.reviewRows === 0 || unresolvedDecisions.length > 0} onClick={() => { if (window.confirm(`Se escribirán ${batch.readyRows + batch.reviewRows} filas válidas del lote ${batch.id}. ¿Deseas aplicar la importación?`)) void confirm(); }}>{pending ? 'Aplicando…' : 'Confirmar y escribir datos'}</button>}
      {batch.status === 'IMPORTED' && <p role="status">Importación confirmada: {batch.importedRows} filas aplicadas. El lote ya no admite otra confirmación.</p>}
    </section>}
  </section>;
}
