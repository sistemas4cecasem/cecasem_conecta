import { FormSection, FormActions } from '../../components/ui/forms';
import { ActionLink, Button } from '../../components/ui/actions';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import type { AuthIdentity } from '../auth/session';
import { organizationFormSchema, organizationSchema, type Category, type Organization, type OrganizationFormValues } from './contracts';
import { useCategories, useDirectoryMutation } from './queries';
import { Field, inputClass, MutationError, Pagination, QueryState } from './directory-ui';

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const values = new Map(current.map(item => [item.id, item]));
  for (const item of incoming) values.set(item.id, item);
  return [...values.values()];
}

export function OrganizationForm({ identity, initial, branchOfId, saved, cancel, reload }: {
  identity: AuthIdentity; initial?: Organization; branchOfId?: string; saved: (organization: Organization) => void; cancel: () => void; reload?: () => Promise<Organization | undefined>;
}) {
  const form = useForm<OrganizationFormValues>({ resolver: zodResolver(organizationFormSchema), defaultValues: {
    name: initial?.name ?? '', country: initial?.country ?? '', alias: initial?.alias ?? '', description: initial?.description ?? '',
    officialWebsite: initial?.officialWebsite ?? '', branchOfId: initial?.branchOfId ?? branchOfId ?? '', categoryIds: initial?.categories.map(c => c.id) ?? [] } });
  const mutation = useDirectoryMutation(identity);
  const [categoryPage, setCategoryPage] = useState(1); const [categoryName, setCategoryName] = useState('');
  const categories = useCategories(identity, `categories?status=active&page=${categoryPage}&name=${encodeURIComponent(categoryName)}`);
  const selectedIds = useWatch({ control: form.control, name: 'categoryIds' });
  const available = [...(categories.data?.items ?? []), ...(initial?.categories ?? []).filter(c => !categories.data?.items.some(item => item.id === c.id))];
  const [knownCategories, setKnownCategories] = useState<Category[]>(initial?.categories ?? []);
  const [version, setVersion] = useState(initial?.version);

  const selectedCategoryNames = selectedIds.map(id => [...knownCategories, ...(categories.data?.items ?? [])].find(category => category.id === id)).filter((category): category is Category => !!category);

  async function submit(values: OrganizationFormValues) {
    try {
      const result = await mutation.mutateAsync({ path: initial ? 'organizations/' + initial.id : 'organizations', method: initial ? 'PUT' : 'POST',
        body: { ...values, branchOfId: values.branchOfId || null, ...(initial ? { expectedVersion: version } : {}) } });
      saved(organizationSchema.parse(result));
    } catch { /* La mutación mantiene el error y el borrador. */ }
  }
  async function reloadForm() {
    const row = await reload?.();
    if (!row) return;
    form.reset({ name: row.name, country: row.country ?? '', alias: row.alias ?? '', description: row.description ?? '',
      officialWebsite: row.officialWebsite ?? '', branchOfId: row.branchOfId ?? branchOfId ?? '', categoryIds: row.categories.map(c => c.id) });
    setKnownCategories(current => mergeById(current, row.categories));
    setVersion(row.version); mutation.reset();
  }

  return <form onSubmit={form.handleSubmit(submit)} className="organization-form">
    <input type="hidden" {...form.register('branchOfId')} />
    <FormSection className="organization-form-group" heading="Datos institucionales">
      <div className="organization-basic-fields">
        <Field label="Nombre" error={form.formState.errors.name?.message}><input {...form.register('name')} className={inputClass} maxLength={250} /></Field>
        <Field label="País (opcional)" error={form.formState.errors.country?.message}><input {...form.register('country')} className={inputClass} maxLength={150} /></Field>
        <Field label="Sigla o nombre alternativo (opcional)" error={form.formState.errors.alias?.message}><input {...form.register('alias')} className={inputClass} maxLength={150} /></Field>
        <Field label="Descripción (opcional)" error={form.formState.errors.description?.message}><textarea {...form.register('description')} className={inputClass} maxLength={5000} /></Field>
        <Field label="Sitio oficial (opcional)" error={form.formState.errors.officialWebsite?.message}><input {...form.register('officialWebsite')} className={inputClass} maxLength={2048} placeholder="https://…" /></Field>
      </div>
    </FormSection>

    <FormSection className="organization-form-group" heading="Categorías múltiples (opcional)">
      <ActionLink to="/organizations/categories" className="inline-flex min-h-11 items-center">Mantener categorías</ActionLink>
      <Field label="Filtrar categorías por nombre"><input value={categoryName} onChange={e => { setKnownCategories(current => mergeById(current, categories.data?.items ?? [])); setCategoryName(e.target.value); setCategoryPage(1); }} className={inputClass} /></Field>
      <QueryState pending={categories.isPending} error={categories.isError} retry={categories.refetch} />
      <p className="organization-selection-summary" aria-live="polite">{selectedIds.length} categorías seleccionadas.</p>
      {!!selectedCategoryNames.length && <ul className="organization-selected-categories" aria-label="Categorías seleccionadas">
        {selectedCategoryNames.map(category => <li key={category.id}>{category.name}{!category.isActive && ' (inactiva)'}</li>)}
      </ul>}
      <div className="organization-category-options" role="group" aria-label="Opciones de categoría">
        {available.map(category => <label key={category.id} className="flex min-h-11 items-center gap-2">
          <input type="checkbox" value={category.id} checked={selectedIds.includes(category.id)}
          onChange={e => { setKnownCategories(current => mergeById(current, [category])); form.setValue('categoryIds', e.target.checked ? [...selectedIds, category.id] : selectedIds.filter(id => id !== category.id), { shouldDirty: true }); }} />
          <span className="min-w-0 break-words">{category.name}{!category.isActive && ' (inactiva; asociación conservada)'}</span></label>)}
      </div>
      {categories.data?.total === 0 && <p>No hay categorías activas. Puedes crear el catálogo sin completar otros datos de la organización.</p>}
      {categories.data && categories.data.total > 0 && <Pagination page={categoryPage} total={categories.data.total} onPage={nextPage => { setKnownCategories(current => mergeById(current, categories.data?.items ?? [])); setCategoryPage(nextPage); }} />}
    </FormSection>

    <MutationError error={mutation.error} reload={reload ? reloadForm : undefined} />
    <FormActions className="organization-form-actions"><Button type="submit" variant="primary" pending={mutation.isPending} disabled={mutation.isPending}>{mutation.isPending ? 'Guardando…' : branchOfId || initial?.branchOfId ? 'Guardar sede' : 'Guardar organización'}</Button>
      <Button disabled={mutation.isPending} onClick={cancel}>Cancelar</Button></FormActions>
  </form>;
}
