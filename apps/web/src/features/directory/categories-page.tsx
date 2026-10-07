import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from '../auth/session';
import { categoryFormSchema, categorySchema, type Category } from './contracts';
import { useCategories, useDirectoryMutation } from './queries';
import { MutationError } from './directory-ui';
import { Button } from '../../components/ui/actions';
import { FormActions, FormField, FormSection, Input, Select } from '../../components/ui/forms';
import { FilterBar, PageHeader, Surface } from '../../components/ui/layout';
import { EmptyState, QueryFeedback, StatusBadge } from '../../components/ui/feedback';
import { DataList, DataListItem, Pagination } from '../../components/ui/lists';
import { DirectoryHistory } from './directory-history';
import type { AuthIdentity } from '../auth/session';
import './directory-pages.css';

function CategoryEditor({ identity, initial, done, reload }: { identity: AuthIdentity; initial?: Category; done: () => void; reload?: () => Promise<void> }) {
  const form = useForm<{ name: string }>({ resolver: zodResolver(categoryFormSchema), defaultValues: { name: initial?.name ?? '' } });
  const mutation = useDirectoryMutation(identity);
  return <form className="space-y-3" onSubmit={form.handleSubmit(async values => {
    try { categorySchema.parse(await mutation.mutateAsync({ path: initial ? 'categories/' + initial.id : 'categories', method: initial ? 'PUT' : 'POST',
      body: { ...values, ...(initial ? { expectedVersion: initial.version } : {}) } })); form.reset({ name: '' }); done(); } catch { /* Conservar borrador. */ }
  })}>
    <FormSection heading={initial ? 'Editar categoría' : 'Nueva categoría'}>
    <FormField label={initial ? 'Nuevo nombre de categoría' : 'Nombre de categoría'} error={form.formState.errors.name?.message}>
      {control => <Input {...form.register('name')} {...control} maxLength={150} />}
    </FormField>
    </FormSection>
    <MutationError modern error={mutation.error} reload={initial ? async () => { await reload?.(); done(); } : undefined} />
    <FormActions><Button type="submit" variant="primary" pending={mutation.isPending} disabled={mutation.isPending}>{mutation.isPending ? 'Guardando…' : initial ? 'Guardar categoría' : 'Crear categoría'}</Button>
      {initial && <Button type="button" onClick={done}>Cancelar edición</Button>}</FormActions>
  </form>;
}
function CategoryCard({ identity, row }: { identity: AuthIdentity; row: Category }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null); const [history, setHistory] = useState(false);
  const mutation = useDirectoryMutation(identity);
  const reload = async () => { await client.invalidateQueries({ queryKey: ['directory', identity.id, 'categories'] }); mutation.reset(); };
  return <DataListItem><div className="directory-row-heading"><h2>{row.name}</h2><StatusBadge tone={row.isActive ? 'success' : 'neutral'}>{row.isActive ? 'Activa' : 'Inactiva'}</StatusBadge></div>
    {editing ? <CategoryEditor identity={identity} initial={editing} done={() => setEditing(null)} reload={reload} /> : <FormActions className="directory-category-actions">
      {identity.permissions.includes('directory.write') && <Button onClick={() => setEditing(row)}>Editar {row.name}</Button>}
      {identity.permissions.includes('directory.status.update') && <Button variant="ghost" pending={mutation.isPending} disabled={mutation.isPending}
        onClick={() => void mutation.mutateAsync({ path: 'categories/' + row.id + '/status', method: 'PATCH', body: { isActive: !row.isActive, expectedVersion: row.version } }).catch(() => undefined)}>{row.isActive ? 'Desactivar' : 'Reactivar'} {row.name}</Button>}
      {identity.permissions.includes('directory.history.read') && <Button variant="ghost" aria-expanded={history} onClick={() => setHistory(!history)}>Historial de {row.name}</Button>}
    </FormActions>}
    <MutationError modern error={mutation.error} reload={reload} />
    {history && <DirectoryHistory identity={identity} path={'categories/' + row.id + '/history'} />}
  </DataListItem>;
}
export function CategoriesPage() {
  const session = useSession(); const identity = session.data; const [page, setPage] = useState(1); const [status, setStatus] = useState('active');
  const categories = useCategories(identity, `categories?page=${page}&status=${status}`);
  if (!identity?.permissions.includes('directory.read')) return <p role="alert">No tienes permiso para consultar categorías.</p>;
  return <section className="directory-page directory-categories">
    <PageHeader eyebrow="Directorio" title="Categorías institucionales" description="Mantén el catálogo utilizado para clasificar las organizaciones." />
    <FilterBar className="directory-category-filter" aria-label="Filtros de categorías"><FormField label="Estado de categorías">{control => <Select {...control} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="active">Activas</option><option value="inactive">Inactivas</option><option value="all">Todas</option></Select>}</FormField></FilterBar>
    <div className={`directory-category-layout ${identity.permissions.includes('directory.write') ? '' : 'directory-category-readonly'}`}>
    {identity.permissions.includes('directory.write') && <Surface className="directory-category-create"><CategoryEditor identity={identity} done={() => undefined} /></Surface>}
    <Surface className="directory-category-results" aria-label="Resultados de categorías">
    {categories.data && <p className="ui-description">{categories.data.total} categorías</p>}
    <QueryFeedback pending={categories.isPending} error={categories.isError} retry={categories.refetch} />
    {categories.data?.total === 0 && <EmptyState title="No hay categorías para estos filtros. El catálogo comienza vacío." />}
    <DataList>{categories.data?.items.map(row => <CategoryCard key={row.id} identity={identity} row={row} />)}</DataList>
    {categories.data && <Pagination page={page} total={categories.data.total} onPage={setPage} />}
    </Surface></div>
  </section>;
}
