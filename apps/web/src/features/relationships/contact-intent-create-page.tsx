import { FormActions, FormSection } from '../../components/ui/forms';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { useNavigate } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { DirectoryTargetPicker, type PickedDirectoryTarget } from '../directory/target-picker';
import { Field, inputClass, MutationError } from '../directory/directory-ui';
import { intentFormSchema } from './contracts';
import { intentIdentityKey, useIntentMutation } from './queries';
import { canReadRelationshipContext, useRelationshipContext } from './context-queries';
import { RelationshipContextPanel } from './relationship-context-panel';
import { PageHeader } from '../../components/ui/layout';
import { ActionLink, Button } from '../../components/ui/actions';
export function ContactIntentCreatePage() {
  const identity = useSession().data;
  if (!identity?.permissions.includes('relationships.intent.create')) return <p role="alert">No tienes permiso para crear intenciones.</p>;
  return <IntentForm key={intentIdentityKey(identity).join(':')} identity={identity} />;
}
function IntentForm({ identity }: { identity: AuthIdentity }) {
  const navigate = useNavigate(), mutation = useIntentMutation(identity);
  const [target, setTarget] = useState<PickedDirectoryTarget | null>(null);
  const context = useRelationshipContext(identity, target);
  const contactBlocked = context.data?.contactAllowed === false;
  const form = useForm<z.infer<typeof intentFormSchema>>({ resolver: zodResolver(intentFormSchema), defaultValues: { purpose: '', targetId: '', targetKind: 'ORGANIZATION' } });
  function select(value: PickedDirectoryTarget | null) {
    setTarget(value); form.setValue('targetId', value?.id ?? '', { shouldValidate: true }); form.setValue('targetKind', value?.kind ?? 'ORGANIZATION');
  }
  return <section className="ui-editor-page"><PageHeader back={<ActionLink appearance="back" to="/contact-intents">Volver al listado</ActionLink>} eyebrow="Relaciones / Intenciones" title="Crear intención de contacto" />
    <form className="ui-editor-form" onSubmit={form.handleSubmit(async values => {
      if (contactBlocked) return;
      try { const row = await mutation.mutateAsync({ path: 'contact-intents', body: { purpose: values.purpose,
        ...(values.targetKind === 'ORGANIZATION' ? { organizationId: values.targetId } : { personId: values.targetId }) } }); navigate('/contact-intents/' + row.id); } catch { /* La mutación conserva el borrador y expone el error. */ }
    })}>
      <FormSection heading="Objetivo institucional"><DirectoryTargetPicker identity={identity} selected={target} onSelect={select} />
      <RelationshipContextPanel identity={identity} target={target} />
      {form.formState.errors.targetId && <p role="alert">{form.formState.errors.targetId.message}</p>}
      </FormSection><Field label="Propósito" error={form.formState.errors.purpose?.message}><textarea className={inputClass} rows={5} maxLength={5000} {...form.register('purpose')} /></Field>
      <MutationError error={mutation.error} />
      <FormActions><Button type="submit" variant="primary" disabled={mutation.isPending || contactBlocked || (!!target && canReadRelationshipContext(identity) && context.isPending)}>{mutation.isPending ? 'Guardando…' : 'Guardar intención'}</Button></FormActions>
    </form></section>;
}
