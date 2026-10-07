import { useId, useState, type ReactNode } from 'react';
import { Button } from '../../components/ui/actions';
import { QueryFeedback } from '../../components/ui/feedback';
import { FieldHelp, FormField, Input, Select, type FieldControlProps } from '../../components/ui/forms';
import { Pagination as VisualPagination } from '../../components/ui/lists';
import { organizationFilterKeys } from './organization-filter.contracts';
import type { AuthIdentity } from '../auth/session';
import type { Category } from './contracts';
import { useCategories } from './queries';
import { buttonClass, Field, inputClass, Pagination, QueryState } from './directory-ui';
import { verificationLabels } from './verification.contracts';

type SelectedCategory = Pick<Category, 'id' | 'name' | 'isActive'>;
// La presentación nueva es optativa: Búsqueda global mantiene su composición actual.
function FilterField({ label, modern, describedBy, children }: { label: string; modern: boolean; describedBy?: string; children: (control: Partial<FieldControlProps>) => ReactNode }) {
  return modern ? <FormField label={label} describedBy={describedBy}>{children}</FormField> : <Field label={label}>{children({})}</Field>;
}
export function CategoryFilter({ identity, selected, onChange, modern = false }: { identity: AuthIdentity; selected: SelectedCategory | null; onChange: (category: SelectedCategory | null) => void; modern?: boolean }) {
  const [page, setPage] = useState(1);
  const catalog = useCategories(identity, `categories?status=all&page=${page}`);
  const options = catalog.data?.items ?? [];
  const CategorySelect = modern ? Select : 'select';
  const CatalogPagination = modern ? VisualPagination : Pagination;
  return <section aria-label="Catálogo de categorías para filtrar" className="space-y-2">
    <FilterField label="Categoría" modern={modern}>{control => <CategorySelect {...control} className={modern ? undefined : inputClass} value={selected?.id ?? ''} disabled={catalog.isPending || catalog.isError}
      onChange={event => onChange(options.find(category => category.id === event.target.value) ?? null)}>
      <option value="">Todas las categorías</option>
      {selected && !options.some(category => category.id === selected.id) && <option value={selected.id}>{selected.name}{selected.isActive ? '' : ' (inactiva)'}</option>}
      {options.map(category => <option key={category.id} value={category.id}>{category.name}{category.isActive ? '' : ' (inactiva)'}</option>)}
    </CategorySelect>}</FilterField>
    {catalog.isPending && <p role="status">Cargando categorías…</p>}
    {modern ? <QueryFeedback pending={false} error={catalog.isError} retry={catalog.refetch} /> : <QueryState pending={false} error={catalog.isError} retry={catalog.refetch} />}
    {catalog.data?.total === 0 && <p>No hay categorías registradas.</p>}
    {catalog.data && catalog.data.total > catalog.data.pageSize && <CatalogPagination page={page} total={catalog.data.total} pageSize={catalog.data.pageSize} onPage={setPage} />}
  </section>;
}

export function OrganizationFilters({ identity, params, change, prefix = '', presentation = 'legacy' }: {
  identity: AuthIdentity; params: URLSearchParams; change: (values: Record<string, string>) => void; prefix?: string; presentation?: 'legacy' | 'modern';
}) {
  const key = (field: string) => prefix ? prefix + field.charAt(0).toUpperCase() + field.slice(1) : field;
  const value = (field: string) => params.get(key(field)) ?? '';
  const update = (field: string, next: string) => change({ [key(field)]: next, page: '1' });
  const categoryId = value('categoryId');
  const [selected, setSelected] = useState<SelectedCategory | null>(null);
  const category = categoryId ? selected?.id === categoryId ? selected : { id: categoryId, name: 'Categoría seleccionada', isActive: true } : null;

  const canReadCommunications = ['relationships.process.read', 'communications.read'].every(permission => identity.permissions.includes(permission));
  const communicationHelpId = useId();
  const modern = presentation === 'modern';
  const FilterInput = modern ? Input : 'input';
  const FilterSelect = modern ? Select : 'select';
  const communicationHelp = 'Incluye comunicaciones enviadas y recibidas, también invalidadas. Las notas internas y los medios de contacto no cuentan.';
  const clear = () => change(Object.fromEntries([...organizationFilterKeys.map(field => [key(field), '']), ['page', '1']]));
  const summary = [
    ...(params.get('name') ? [`Nombre: ${params.get('name')}`] : []),
    ...(value('country') ? [`País: ${value('country')}`] : []),
    `Estado: ${value('status') === 'inactive' ? 'Inactivas' : value('status') === 'all' ? 'Todas' : 'Activas'}`,
    ...(value('verificationStatus') ? [`Verificación: ${verificationLabels[value('verificationStatus') as keyof typeof verificationLabels] ?? value('verificationStatus')}`] : []),
    ...(canReadCommunications && value('withCommunications') ? [value('withCommunications') === 'true' ? 'Con comunicaciones históricas' : 'Sin comunicaciones históricas'] : []),
    ...(category ? [`Categoría: ${category.name}`] : []),
  ].join(' · ');
  return <section aria-label="Filtros de organizaciones" className="min-w-0 space-y-4">
    {prefix && <p>Estos filtros reducen únicamente organizaciones. Personas, procesos y antecedentes de correo conservan su búsqueda.</p>}
    <div className={modern ? 'organizations-secondary-filters' : 'grid min-w-0 gap-4 sm:grid-cols-2'}>
      <FilterField label="País" modern={modern}>{control => <FilterInput {...control} className={modern ? undefined : inputClass} maxLength={150} value={value('country')} onChange={event => update('country', event.target.value)} />}</FilterField>
      <FilterField label={prefix ? 'Estado de organizaciones' : 'Estado'} modern={modern}>{control => <FilterSelect {...control} className={modern ? undefined : inputClass} value={value('status') || (prefix ? 'all' : 'active')} onChange={event => update('status', event.target.value)}>
        <option value="active">Activas</option><option value="inactive">Inactivas</option><option value="all">Todas</option></FilterSelect>}</FilterField>
      <FilterField label="Condición de verificación" modern={modern}>{control => <FilterSelect {...control} className={modern ? undefined : inputClass} value={value('verificationStatus')} onChange={event => update('verificationStatus', event.target.value)}>
        <option value="">Todas las condiciones</option>{Object.entries(verificationLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</FilterSelect>}</FilterField>
      {canReadCommunications && <FilterField label="Comunicaciones externas" modern={modern} describedBy={modern ? communicationHelpId : undefined}>{control => <FilterSelect {...control} className={modern ? undefined : inputClass} value={value('withCommunications')} onChange={event => update('withCommunications', event.target.value)}>
        <option value="">Con y sin comunicaciones</option><option value="true">Con comunicaciones históricas</option><option value="false">Sin comunicaciones históricas</option></FilterSelect>}</FilterField>}
      {modern && <CategoryFilter identity={identity} selected={category} modern onChange={next => { setSelected(next); update('categoryId', next?.id ?? ''); }} />}
    </div>
    {modern && canReadCommunications && <FieldHelp id={communicationHelpId}>{communicationHelp}</FieldHelp>}
    {!modern && <CategoryFilter identity={identity} selected={category} onChange={next => { setSelected(next); update('categoryId', next?.id ?? ''); }} />}
    {!modern && canReadCommunications && <p className="text-sm">{communicationHelp}</p>}
    {prefix && <p className="text-sm">Para mostrar organizaciones inactivas, activa también «Incluir fichas inactivas».</p>}
    {modern ? <div className="organizations-filter-footer"><p className="organizations-filter-summary">{summary}</p><Button onClick={clear}>Limpiar filtros</Button></div>
      : <button type="button" className={buttonClass} onClick={clear}>Limpiar filtros{prefix ? ' de organizaciones' : ''}</button>}
  </section>;
}
