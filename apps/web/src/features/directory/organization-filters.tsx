import { useState } from 'react';
import { organizationFilterKeys } from './organization-filter.contracts';
import type { AuthIdentity } from '../auth/session';
import type { Category } from './contracts';
import { useCategories } from './queries';
import { buttonClass, Field, inputClass, Pagination, QueryState } from './directory-ui';
import { verificationLabels } from './verification.contracts';

type SelectedCategory = Pick<Category, 'id' | 'name' | 'isActive'>;
export function CategoryFilter({ identity, selected, onChange }: { identity: AuthIdentity; selected: SelectedCategory | null; onChange: (category: SelectedCategory | null) => void }) {
  const [page, setPage] = useState(1);
  const catalog = useCategories(identity, `categories?status=all&page=${page}`);
  const options = catalog.data?.items ?? [];
  return <section aria-label="Catálogo de categorías para filtrar" className="space-y-2">
    <Field label="Categoría"><select className={inputClass} value={selected?.id ?? ''} disabled={catalog.isPending || catalog.isError}
      onChange={event => onChange(options.find(category => category.id === event.target.value) ?? null)}>
      <option value="">Todas las categorías</option>
      {selected && !options.some(category => category.id === selected.id) && <option value={selected.id}>{selected.name}{selected.isActive ? '' : ' (inactiva)'}</option>}
      {options.map(category => <option key={category.id} value={category.id}>{category.name}{category.isActive ? '' : ' (inactiva)'}</option>)}
    </select></Field>
    {catalog.isPending && <p role="status">Cargando categorías…</p>}
    <QueryState pending={false} error={catalog.isError} retry={catalog.refetch} />
    {catalog.data?.total === 0 && <p>No hay categorías registradas.</p>}
    {catalog.data && catalog.data.total > catalog.data.pageSize && <Pagination page={page} total={catalog.data.total} pageSize={catalog.data.pageSize} onPage={setPage} />}
  </section>;
}

export function OrganizationFilters({ identity, params, change, prefix = '' }: {
  identity: AuthIdentity; params: URLSearchParams; change: (values: Record<string, string>) => void; prefix?: string;
}) {
  const key = (field: string) => prefix ? prefix + field.charAt(0).toUpperCase() + field.slice(1) : field;
  const value = (field: string) => params.get(key(field)) ?? '';
  const update = (field: string, next: string) => change({ [key(field)]: next, page: '1' });
  const categoryId = value('categoryId');
  const [selected, setSelected] = useState<SelectedCategory | null>(null);
  const category = categoryId ? selected?.id === categoryId ? selected : { id: categoryId, name: 'Categoría seleccionada', isActive: true } : null;

  const canReadCommunications = ['relationships.process.read', 'communications.read'].every(permission => identity.permissions.includes(permission));
  return <section aria-label="Filtros de organizaciones" className="min-w-0 space-y-4">
    {prefix && <p>Estos filtros reducen únicamente organizaciones. Personas, procesos y antecedentes de correo conservan su búsqueda.</p>}
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <Field label="País"><input className={inputClass} maxLength={150} value={value('country')} onChange={event => update('country', event.target.value)} /></Field>
      <Field label={prefix ? 'Estado de organizaciones' : 'Estado'}><select className={inputClass} value={value('status') || (prefix ? 'all' : 'active')} onChange={event => update('status', event.target.value)}>
        <option value="active">Activas</option><option value="inactive">Inactivas</option><option value="all">Todas</option></select></Field>
      <Field label="Condición de verificación"><select className={inputClass} value={value('verificationStatus')} onChange={event => update('verificationStatus', event.target.value)}>
        <option value="">Todas las condiciones</option>{Object.entries(verificationLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
      {canReadCommunications && <Field label="Comunicaciones externas"><select className={inputClass} value={value('withCommunications')} onChange={event => update('withCommunications', event.target.value)}>
        <option value="">Con y sin comunicaciones</option><option value="true">Con comunicaciones históricas</option><option value="false">Sin comunicaciones históricas</option></select></Field>}
    </div>
    <CategoryFilter identity={identity} selected={category} onChange={next => { setSelected(next); update('categoryId', next?.id ?? ''); }} />
    {canReadCommunications && <p className="text-sm">Incluye comunicaciones enviadas y recibidas, también invalidadas. Las notas internas y los medios de contacto no cuentan.</p>}
    {prefix && <p className="text-sm">Para mostrar organizaciones inactivas, activa también «Incluir fichas inactivas».</p>}
    <button type="button" className={buttonClass} onClick={() => change(Object.fromEntries([...organizationFilterKeys.map(field => [key(field), '']), ['page', '1']]))}>Limpiar filtros{prefix ? ' de organizaciones' : ''}</button>
  </section>;
}
