import { PageHeader, Surface } from '../../components/ui/layout';
import { FormSection, FormField, Input, Select, FormActions, FieldHelp } from '../../components/ui/forms';
import { Button } from '../../components/ui/actions';
import { Alert, StatusBadge } from '../../components/ui/feedback';
import { DataList, DataListItem, Metadata } from '../../components/ui/lists';
import './data-exchange.css';
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
  if (!identity?.permissions.includes('data_exchange.import.execute')) return <section className="data-exchange-page"><PageHeader title="Importar Excel" eyebrow="Herramientas"/><Alert tone="danger" role="alert">No tienes permiso para importar archivos históricos.</Alert></section>;

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
  return <section aria-label="Importación Excel histórica" className="data-exchange-page">
    <PageHeader title="Importar Excel" eyebrow="Herramientas" description="Importa información institucional desde un archivo XLSX mediante el mapeo de columnas disponible."/>
    <Alert tone="info">Solo se aceptan archivos XLSX. La inspección no los almacena y el preview solo guarda el análisis; la confirmación es una acción distinta que escribe datos.</Alert>
    <Surface heading="Selección del archivo" aria-label="Seleccionar y analizar archivo" className="exchange-form-surface">
      <FormField label="Archivo XLSX" help="Formato .xlsx. Tamaño máximo admitido por el servidor: 20 MB.">{control =>
        <Input {...control} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => { setFile(event.target.files?.[0] ?? null); setInspection(null); setBatch(null); }}/>}</FormField>
      {file && <Metadata items={[{label:'Archivo seleccionado',value:file.name},{label:'Tamaño',value:file.size+' bytes'}]}/>}
      <FormActions><Button disabled={!file || pending} pending={pending} onClick={() => void inspect()}>{pending ? 'Analizando…' : 'Inspeccionar archivo'}</Button></FormActions>
    </Surface>
    {inspection && <Surface heading="Mapeo de columnas" className="exchange-form-surface">
      <FormSection heading="Origen y tipo de datos" className="exchange-fields">
        <FormField label="Hoja">{control => <Select {...control} value={worksheetName} onChange={event => { setWorksheetName(event.target.value); setHeaderRow(1); setMapping({}); }}>
          {inspection.sheets.map(item => <option key={item.name} value={item.name}>{item.name} · {item.rowCount} filas</option>)}</Select>}</FormField>
        <FormField label="Fila de encabezados">{control => <Select {...control} value={headerRow} onChange={event => { setHeaderRow(Number(event.target.value)); setMapping({}); }}>
          {sheet?.sample.map(row => <option key={row.rowNumber} value={row.rowNumber}>Fila {row.rowNumber}: {row.cells.map(headerLabel).join(' · ')}</option>)}</Select>}</FormField>
        <FormField label="Tipo de datos">{control => <Select {...control} value={kind} onChange={event => { setKind(event.target.value as Kind); setMapping({}); }}>
          {Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>}</FormField>
      </FormSection>
      {sheet && <Metadata items={[{label:'Filas de la hoja',value:sheet.rowCount},{label:'Columnas de la hoja',value:sheet.columnCount}]}/>}
      <FieldHelp>Mapea solo las columnas que correspondan. Deja las demás en «Sin asignar» para ignorarlas como datos de negocio; sus valores originales se conservan y aparecerán como advertencia en el preview.</FieldHelp>
      <FormSection heading="Campos de destino en CECASEM Conecta" description="Para cada campo de destino, selecciona su columna de origen en el Excel." className="exchange-fields">
        {fieldOptions[kind].map(field => <FormField key={field.key} label={field.label} help="Columna de origen en Excel">{control => <Select {...control} value={mapping[field.key] ?? ''} onChange={event => setMapping(current => { const next = { ...current }; if (event.target.value) next[field.key] = Number(event.target.value); else delete next[field.key]; return next; })}>
          <option value="">Sin asignar</option>{headers.map(header => <option key={header.column} disabled={selectedColumns.has(header.column) && mapping[field.key] !== header.column} value={header.column}>Columna {header.column}: {headerLabel(header)}</option>)}</Select>}</FormField>)}
      </FormSection>
      <FormActions><Button variant="primary" pending={pending} disabled={pending || !headers.length} onClick={() => void preview()}>{pending ? 'Creando preview…' : 'Analizar y crear preview'}</Button></FormActions>
    </Surface>}
    {batches.data && batches.data.items.length > 0 && <Surface heading={`Lotes anteriores · ${batches.data.total}`} aria-label="Lotes anteriores">
      <DataList>{batches.data.items.map(item => <DataListItem key={item.id} className="exchange-batch-row"><div><p>{item.originalFilename}</p><StatusBadge>{statusLabel(item.status)}</StatusBadge><p className="ui-description">Filas importadas/analizadas: {item.importedRows}/{item.analyzedRows}</p></div><Button disabled={pending} onClick={() => void openBatch(item.id)}>Ver lote</Button></DataListItem>)}</DataList>
    </Surface>}
    {error && <Alert tone="danger" role="alert">{error}</Alert>}
    {batch && <Surface heading={batch.status === 'IMPORTED' ? 'Resultado del lote' : 'Revisión previa a importar'} aria-label="Preview del lote">
      <p>Archivo: {batch.originalFilename} · {kindLabels[batch.recordKind]}</p><p>Lote: {batch.id} · Estado: {statusLabel(batch.status)}</p>
      <Metadata items={[{label:'Filas analizadas',value:batch.analyzedRows},{label:'Listas',value:batch.readyRows},{label:'Revisión',value:batch.reviewRows},{label:'Inválidas',value:batch.invalidRows},{label:'Importadas',value:batch.importedRows}]}/>
      {batch.status === 'ANALYZED' && <p className="text-sm text-slate-700">Las filas en «Revisión» contienen advertencias o coincidencias. Las posibles coincidencias requieren una decisión antes de escribir los datos; las filas inválidas no se importan.</p>}
      {batch.status === 'ANALYZED' && unresolvedDecisions.length > 0 && <p role="status">Resuelve {unresolvedDecisions.length} {unresolvedDecisions.length === 1 ? 'coincidencia' : 'coincidencias'} pendiente{unresolvedDecisions.length === 1 ? '' : 's'} para habilitar la importación.</p>}
      <DataList className="exchange-preview-rows">{batch.rows.map(row => <DataListItem key={row.rowNumber}><h3 className="font-semibold">Fila {row.rowNumber} · {statusLabel(row.status)}</h3>
        <dl className="grid gap-1 sm:grid-cols-2">{Object.entries(row.normalizedValues ?? row.sourceValues).map(([field, value]) => <div key={field}><dt className="font-medium">{row.normalizedValues ? previewFieldLabel(batch.recordKind, field) : field}</dt><dd>{value === null || value === '' ? 'Sin dato' : String(value)}</dd></div>)}</dl>
        {row.errors.map((item, index) => <Alert key={`e${index}`} tone="danger" role="alert">{item.field ? `${item.field}: ` : ''}{item.message}</Alert>)}
        {row.warnings.map((item, index) => <Alert key={`w${index}`} tone="warning">Advertencia{item.field ? ` · ${item.field}` : ''}: {item.message}</Alert>)}
        {row.matches.map((match, index) => <div key={`${match.id}:${index}`} className="rounded border p-2"><p>{match.kind === 'POSSIBLE' ? 'Posible coincidencia' : match.kind === 'EXACT' ? 'Coincidencia exacta' : 'El medio de contacto ya existe'}: {match.label}{match.score !== null ? ` · ${Math.round(match.score * 100)}%` : ''}</p></div>)}
        {row.status !== 'IMPORTED' && decisionFieldsFor(row).map(field => {
          const candidates = row.matches.filter(match => match.field === field && (match.kind === 'POSSIBLE' || match.kind === 'EXACT'));
          return <FormField key={field} label={`Decisión para ${previewFieldLabel(batch.recordKind, field)}`}>{control => <Select {...control} value={decisions[`${row.rowNumber}:${field}`] ?? ''} onChange={event => setDecisions(current => ({ ...current, [`${row.rowNumber}:${field}`]: event.target.value }))}>
            <option value="">Selecciona una decisión</option><option value="CREATE_NEW">Crear una ficha nueva, sin fusionar</option>{candidates.map(candidate => <option key={candidate.id} value={candidate.id}>Relacionar con {candidate.label}{candidate.kind === 'POSSIBLE' && candidate.score !== null ? ` · ${Math.round(candidate.score * 100)}%` : ''}</option>)}</Select>}</FormField>;
        })}
      </DataListItem>)}</DataList>
      {batch.status === 'ANALYZED' && <Button variant="primary" pending={pending} disabled={pending || batch.readyRows + batch.reviewRows === 0 || unresolvedDecisions.length > 0} onClick={() => { if (window.confirm(`Se escribirán ${batch.readyRows + batch.reviewRows} filas válidas del lote ${batch.id}. ¿Deseas aplicar la importación?`)) void confirm(); }}>{pending ? 'Aplicando…' : 'Confirmar y escribir datos'}</Button>}
      {batch.status === 'IMPORTED' && <Alert tone="info" role="status">Importación confirmada: {batch.importedRows} filas aplicadas. El lote ya no admite otra confirmación.</Alert>}
    </Surface>}
  </section>;
}
