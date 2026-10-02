import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import type { AuthIdentity } from '../auth/session';
import { organizationFormSchema, organizationSchema, type Organization, type OrganizationFormValues } from './contracts';
import { useCategories, useDirectoryMutation, useOrganizations } from './queries';
import { buttonClass, Field, inputClass, MutationError, Pagination, QueryState } from './directory-ui';

export function OrganizationForm({ identity, initial, saved, cancel, reload }: {
  identity: AuthIdentity; initial?: Organization; saved: (organization: Organization) => void; cancel: () => void; reload?: () => Promise<Organization | undefined>;
}) {
  const form = useForm<OrganizationFormValues>({ resolver: zodResolver(organizationFormSchema), defaultValues: {
    name: initial?.name ?? '', country: initial?.country ?? '', alias: initial?.alias ?? '', description: initial?.description ?? '',
    officialWebsite: initial?.officialWebsite ?? '', parentId: initial?.parentId ?? '', categoryIds: initial?.categories.map(c => c.id) ?? [] } });
  const mutation = useDirectoryMutation(identity);
  const [parentPage, setParentPage] = useState(1); const [parentName, setParentName] = useState('');
  const [categoryPage, setCategoryPage] = useState(1); const [categoryName, setCategoryName] = useState('');
  const parents = useOrganizations(identity, `organizations?status=all&page=${parentPage}&name=${encodeURIComponent(parentName)}`);
  const categories = useCategories(identity, `categories?status=active&page=${categoryPage}&name=${encodeURIComponent(categoryName)}`);
  const selectedIds = useWatch({ control: form.control, name: 'categoryIds' });
  const available = [...(categories.data?.items ?? []), ...(initial?.categories ?? []).filter(c => !categories.data?.items.some(item => item.id === c.id))];
  const [version, setVersion] = useState(initial?.version);
  async function submit(values: OrganizationFormValues) {
    try {
      const result = await mutation.mutateAsync({ path: initial ? 'organizations/' + initial.id : 'organizations', method: initial ? 'PUT' : 'POST',
        body: { ...values, parentId: values.parentId || null, ...(initial ? { expectedVersion: version } : {}) } });
      saved(organizationSchema.parse(result));
    } catch { /* La mutación mantiene el error y el borrador. */ }
  }
  async function reloadForm() {
    const row = await reload?.();
    if (!row) return;
    form.reset({ name: row.name, country: row.country ?? '', alias: row.alias ?? '', description: row.description ?? '',
      officialWebsite: row.officialWebsite ?? '', parentId: row.parentId ?? '', categoryIds: row.categories.map(c => c.id) });
    setVersion(row.version); mutation.reset();
  }
  return <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
    <Field label="Nombre" error={form.formState.errors.name?.message}><input {...form.register('name')} className={inputClass} maxLength={250} /></Field>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="País (opcional)" error={form.formState.errors.country?.message}><input {...form.register('country')} className={inputClass} maxLength={150} /></Field>
      <Field label="Sigla o nombre alternativo (opcional)" error={form.formState.errors.alias?.message}><input {...form.register('alias')} className={inputClass} maxLength={150} /></Field>
    </div>
    <Field label="Descripción (opcional)" error={form.formState.errors.description?.message}><textarea {...form.register('description')} className={inputClass} maxLength={5000} /></Field>
    <Field label="Sitio oficial (opcional)" error={form.formState.errors.officialWebsite?.message}><input {...form.register('officialWebsite')} className={inputClass} maxLength={2048} placeholder="https://…" /></Field>
    <fieldset className="space-y-2 rounded border p-3"><legend>Organización matriz (opcional)</legend>
      <Field label="Filtrar matrices por nombre"><input value={parentName} onChange={e => { setParentName(e.target.value); setParentPage(1); }} className={inputClass} /></Field>
      <QueryState pending={parents.isPending} error={parents.isError} retry={parents.refetch} />
      <label className="flex min-h-11 items-center gap-2"><input type="radio" {...form.register('parentId')} value="" />Sin matriz</label>
      {initial?.parent && !parents.data?.items.some(p => p.id === initial.parent?.id) && <label className="flex min-h-11 items-center gap-2"><input type="radio" {...form.register('parentId')} value={initial.parent.id} /><span className="min-w-0 break-words">{initial.parent.name}</span></label>}
      {parents.data?.items.filter(p => p.id !== initial?.id).map(parent => <label key={parent.id} className="flex min-h-11 items-center gap-2 break-words">
        <input type="radio" {...form.register('parentId')} value={parent.id} /><span className="min-w-0 break-words">{parent.name}{!parent.isActive && ' (inactiva)'}</span></label>)}
      {parents.data && parents.data.total === 0 && <p>No hay matrices disponibles.</p>}
      {parents.data && <Pagination page={parentPage} total={parents.data.total} onPage={setParentPage} />}
    </fieldset>
    <fieldset className="space-y-2 rounded border p-3"><legend>Categorías múltiples (opcional)</legend>
      <Link to="/organizations/categories" className="inline-flex min-h-11 items-center underline">Mantener categorías</Link>
      <Field label="Filtrar categorías por nombre"><input value={categoryName} onChange={e => { setCategoryName(e.target.value); setCategoryPage(1); }} className={inputClass} /></Field>
      <QueryState pending={categories.isPending} error={categories.isError} retry={categories.refetch} />
      {available.map(category => <label key={category.id} className="flex min-h-11 items-center gap-2">
        <input type="checkbox" value={category.id} checked={selectedIds.includes(category.id)}
          onChange={e => form.setValue('categoryIds', e.target.checked ? [...selectedIds, category.id] : selectedIds.filter(id => id !== category.id), { shouldDirty: true })} />
        <span className="min-w-0 break-words">{category.name}{!category.isActive && ' (inactiva; asociación conservada)'}</span></label>)}
      <p>{selectedIds.length} categorías seleccionadas.</p>
      {categories.data?.total === 0 && <p>No hay categorías activas. Puedes crear el catálogo sin completar otros datos de la organización.</p>}
      {categories.data && <Pagination page={categoryPage} total={categories.data.total} onPage={setCategoryPage} />}
    </fieldset>
    <MutationError error={mutation.error} reload={reload ? reloadForm : undefined} />
    <p className="text-sm">Guardar no verifica la organización.</p>
    <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={mutation.isPending}>{mutation.isPending ? 'Guardando…' : 'Guardar organización'}</button>
      <button type="button" className={buttonClass} disabled={mutation.isPending} onClick={cancel}>Cancelar</button></div>
  </form>;
}
