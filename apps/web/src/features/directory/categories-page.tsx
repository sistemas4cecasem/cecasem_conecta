import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from '../auth/session';
import { categoryFormSchema, categorySchema, type Category } from './contracts';
import { useCategories, useDirectoryMutation } from './queries';
import { buttonClass, Field, inputClass, MutationError, Pagination, QueryState } from './directory-ui';
import { DirectoryHistory } from './directory-history';
import type { AuthIdentity } from '../auth/session';

function CategoryEditor({ identity, initial, done, reload }: { identity: AuthIdentity; initial?: Category; done: () => void; reload?: () => Promise<void> }) {
  const form = useForm<{ name: string }>({ resolver: zodResolver(categoryFormSchema), defaultValues: { name: initial?.name ?? '' } });
  const mutation = useDirectoryMutation(identity);
  return <form className="space-y-3" onSubmit={form.handleSubmit(async values => {
    try { categorySchema.parse(await mutation.mutateAsync({ path: initial ? 'categories/' + initial.id : 'categories', method: initial ? 'PUT' : 'POST',
      body: { ...values, ...(initial ? { expectedVersion: initial.version } : {}) } })); form.reset({ name: '' }); done(); } catch { /* Conservar borrador. */ }
  })}>
    <Field label={initial ? 'Nuevo nombre de categoría' : 'Nombre de categoría'} error={form.formState.errors.name?.message}><input {...form.register('name')} className={inputClass} maxLength={150} /></Field>
    <MutationError error={mutation.error} reload={initial ? async () => { await reload?.(); done(); } : undefined} />
    <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={mutation.isPending}>{mutation.isPending ? 'Guardando…' : initial ? 'Guardar categoría' : 'Crear categoría'}</button>
      {initial && <button className={buttonClass} type="button" onClick={done}>Cancelar edición</button>}</div>
  </form>;
}
function CategoryCard({ identity, row }: { identity: AuthIdentity; row: Category }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null); const [history, setHistory] = useState(false);
  const mutation = useDirectoryMutation(identity);
  const reload = async () => { await client.invalidateQueries({ queryKey: ['directory', identity.id, 'categories'] }); mutation.reset(); };
  return <li className="space-y-3 rounded border p-3 break-words"><h2 className="font-semibold">{row.name} · {row.isActive ? 'Activa' : 'Inactiva'}</h2>
    {editing ? <CategoryEditor identity={identity} initial={editing} done={() => setEditing(null)} reload={reload} /> : <div className="flex flex-wrap gap-3">
      {identity.permissions.includes('directory.write') && <button className={buttonClass} onClick={() => setEditing(row)}>Editar {row.name}</button>}
      {identity.permissions.includes('directory.status.update') && <button className={buttonClass} disabled={mutation.isPending}
        onClick={() => void mutation.mutateAsync({ path: 'categories/' + row.id + '/status', method: 'PATCH', body: { isActive: !row.isActive, expectedVersion: row.version } }).catch(() => undefined)}>{row.isActive ? 'Desactivar' : 'Reactivar'} {row.name}</button>}
      {identity.permissions.includes('directory.history.read') && <button className={buttonClass} onClick={() => setHistory(!history)}>Historial de {row.name}</button>}
    </div>}
    <MutationError error={mutation.error} reload={reload} />
    {history && <DirectoryHistory identity={identity} path={'categories/' + row.id + '/history'} />}
  </li>;
}
export function CategoriesPage() {
  const session = useSession(); const identity = session.data; const [page, setPage] = useState(1); const [status, setStatus] = useState('active');
  const categories = useCategories(identity, `categories?page=${page}&status=${status}`);
  if (!identity?.permissions.includes('directory.read')) return <p role="alert">No tienes permiso para consultar categorías.</p>;
  return <section className="space-y-4"><Link className="inline-flex min-h-11 items-center underline" to="/organizations">Volver al directorio</Link>
    <h1 className="text-2xl font-semibold">Categorías institucionales</h1>
    {identity.permissions.includes('directory.write') && <CategoryEditor identity={identity} done={() => undefined} />}
    <Field label="Estado de categorías"><select className={inputClass} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="active">Activas</option><option value="inactive">Inactivas</option><option value="all">Todas</option></select></Field>
    <QueryState pending={categories.isPending} error={categories.isError} retry={categories.refetch} />
    {categories.data?.total === 0 && <p>No hay categorías para estos filtros. El catálogo comienza vacío.</p>}
    <ul className="space-y-3">{categories.data?.items.map(row => <CategoryCard key={row.id} identity={identity} row={row} />)}</ul>
    {categories.data && <Pagination page={page} total={categories.data.total} onPage={setPage} />}
  </section>;
}
