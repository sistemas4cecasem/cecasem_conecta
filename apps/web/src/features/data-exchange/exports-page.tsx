import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError, apiRequest } from '../../lib/api/client';
import { useSession } from '../auth/session';
import type { ExportFilters, ExportType, ExportPreview } from './exports-contracts';
import { exportFileName, exportTypes, filterSummary } from './exports-contracts';

type CategoriesPage = { items: { id: string; name: string }[]; total: number; page: number; pageSize: number };

async function activeCategories(signal?: AbortSignal) {
  const result: { id: string; name: string }[] = [];
  for (let page = 1; ; page++) {
    const data = await apiRequest<CategoriesPage>(`categories?page=${page}&pageSize=100&status=active`, { signal });
    if (!data) return result;
    result.push(...data.items);
    if (result.length >= data.total || data.items.length === 0) return result;
  }
}

function defaultFilters(type: ExportType): ExportFilters {
  if (type === 'organizations') return { organizationStatus: 'active' };
  if (type === 'contacts') return { personStatus: 'active', relationStatus: 'all' };
  if (type === 'processes') return { processState: 'all' };
  return { opportunityStatus: 'all' };
}

export function ExportsPage() {
  const identity = useSession().data;
  const [type, setType] = useState<ExportType | ''>('');
  const [filtersByType, setFiltersByType] = useState<Partial<Record<ExportType, ExportFilters>>>({});
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const permissions = identity?.permissions ?? [];
  const available = exportTypes.filter(item => permissions.includes(item.requiredPermission));
  const filters = type ? filtersByType[type] ?? defaultFilters(type) : {};
  const categories = useQuery({ queryKey: ['data-exchange', identity?.id, 'export-categories'], enabled: type === 'organizations' && permissions.includes('directory.read'), queryFn: ({ signal }) => activeCategories(signal), retry: false });

  function updateFilters(next: ExportFilters) {
    if (!type) return;
    setFiltersByType(current => ({ ...current, [type]: next }));
    setPreview(null);
    setError('');
  }
  function update(name: keyof ExportFilters, value: string) {
    updateFilters({ ...filters, [name]: value || undefined });
  }
  async function calculatePreview() {
    if (!type) return;
    setPending(true); setError(''); setPreview(null);
    try {
      const result = await apiRequest<ExportPreview>(`data-exchange/exports/${type}/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters }),
      });
      if (!result) throw new Error('El servidor no devolvió el resumen.');
      setPreview(result);
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : 'No se pudo calcular el resumen de exportación.'); }
    finally { setPending(false); }
  }
  async function download() {
    if (!type || !preview?.count) return;
    setPending(true); setError('');
    try {
      const file = await apiRequest<Blob>(`data-exchange/exports/${type}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters }),
      }, 'blob');
      if (!file || file.type !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') throw new Error('El servidor devolvió un archivo no reconocido.');
      const url = URL.createObjectURL(file);
      const link = document.createElement('a'); link.href = url; link.download = exportFileName(type); link.click();
      URL.revokeObjectURL(url);
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : failure instanceof Error ? failure.message : 'No se pudo descargar el XLSX.'); }
    finally { setPending(false); }
  }

  const input = (label: string, name: keyof ExportFilters, placeholder = '') => <label className="block min-w-0">{label}<input className="mt-1 block min-h-11 w-full rounded border px-3" value={String(filters[name] ?? '')} placeholder={placeholder} onChange={event => update(name, event.target.value)} /></label>;
  const select = (label: string, name: keyof ExportFilters, options: [string, string][]) => <label className="block min-w-0">{label}<select className="mt-1 block min-h-11 w-full rounded border p-2" value={String(filters[name] ?? '')} onChange={event => update(name, event.target.value)}><option value="">Cualquiera</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;

  return <section aria-label="Exportación Excel" className="min-w-0 space-y-6 break-words">
    <h1 className="text-2xl font-semibold">Exportación Excel</h1>
    <p>Prepara archivos .xlsx estructurados desde la información que puedes consultar. Se exportan todos los resultados de los filtros, aunque el listado esté paginado.</p>
    {!available.length ? <p role="status">Tu perfil no tiene dominios disponibles para exportar.</p> : <>
      <section className="max-w-3xl space-y-4 rounded border p-4" aria-label="Configurar exportación">
        <label className="block">Tipo de información<select aria-label="Tipo de información" className="mt-1 block min-h-11 w-full rounded border p-2" value={type} onChange={event => { setType(event.target.value as ExportType); setPreview(null); setError(''); }}>
          <option value="">Selecciona un tipo</option>{available.map(item => <option key={item.type} value={item.type}>{item.label}</option>)}
        </select></label>
        {type === 'organizations' && <div className="grid gap-3 sm:grid-cols-2">
          {input('Nombre contiene', 'name')}{input('País', 'country')}
          <label className="block min-w-0">Categoría<select className="mt-1 block min-h-11 w-full rounded border p-2" value={filters.categoryId ?? ''} onChange={event => update('categoryId', event.target.value)}><option value="">Todas</option>{(categories.data ?? []).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          {select('Estado', 'organizationStatus', [['active', 'Activas'], ['inactive', 'Inactivas'], ['all', 'Todas']])}
          {select('Verificación', 'verificationStatus', [['CURRENT', 'Vigente'], ['REVIEW_DUE', 'Revisión pendiente'], ['NEVER_VERIFIED', 'Sin verificar']])}
          {select('Comunicaciones registradas', 'withCommunications', [['true', 'Con comunicaciones'], ['false', 'Sin comunicaciones']])}
        </div>}
        {type === 'contacts' && <div className="grid gap-3 sm:grid-cols-2">
          {input('Nombre contiene', 'name')}
          {select('Estado de persona', 'personStatus', [['active', 'Activas'], ['inactive', 'Inactivas'], ['all', 'Todas']])}
          {select('Tipo de medio', 'contactType', [['EMAIL', 'Correo electrónico'], ['PHONE', 'Teléfono'], ['LINKEDIN', 'LinkedIn'], ['WEBSITE', 'Sitio web'], ['WEB_FORM', 'Formulario web'], ['OTHER', 'Otro']])}
          {select('Vínculos institucionales', 'relationStatus', [['current', 'Vigentes'], ['historical', 'Históricos'], ['all', 'Todos']])}
        </div>}
        {type === 'processes' && <div className="grid gap-3 sm:grid-cols-2">
          {select('Estado del proceso', 'processState', [['PREPARATION', 'En preparación'], ['IN_PROGRESS', 'En curso'], ['WAITING_RESPONSE', 'Esperando respuesta'], ['NEGOTIATION', 'En negociación'], ['CLOSED', 'Cerrado'], ['all', 'Todos']])}
          {input('Identificador de organización', 'processOrganizationId', 'UUID')}{input('Identificador de persona', 'processPersonId', 'UUID')}{input('Identificador de creador', 'createdByUserId', 'UUID')}
        </div>}
        {type === 'opportunities' && <div className="grid gap-3 sm:grid-cols-2">
          {select('Estado de oportunidad', 'opportunityStatus', [['PENDING_REVIEW', 'Pendiente de revisión'], ['PREPARING', 'En preparación'], ['SUBMITTED', 'Postulada'], ['DISCARDED', 'Descartada'], ['FINISHED', 'Finalizada'], ['all', 'Todos']])}
          {input('Identificador de organización', 'opportunityOrganizationId', 'UUID')}{input('Identificador de proceso', 'opportunityProcessId', 'UUID')}
        </div>}
        <div className="flex flex-wrap gap-3"><button className="min-h-11 rounded border px-4" disabled={!type || pending} onClick={() => void calculatePreview()}>{pending ? 'Consultando…' : 'Calcular resumen'}</button>
          {preview && preview.count > 0 && <button className="min-h-11 rounded border border-blue-700 px-4 font-semibold" disabled={pending} onClick={() => void download()}>{pending ? 'Preparando XLSX…' : 'Descargar XLSX'}</button>}</div>
      </section>
      {preview && <section className="max-w-3xl rounded border p-4" aria-label="Resumen de exportación"><h2 className="text-lg font-semibold">Resumen</h2><p>Tipo: {exportTypes.find(item => item.type === preview.type)?.label}</p><p>Filtros: {filterSummary(type as ExportType, filters)}</p><p>{preview.unit}: {preview.count}</p>{preview.count === 0 && <p role="status">No hay resultados para esos filtros. Ajusta la búsqueda antes de descargar.</p>}</section>}
    </>}
    {error && <p role="alert" className="max-w-3xl rounded border border-red-600 p-3">{error}</p>}
  </section>;
}
