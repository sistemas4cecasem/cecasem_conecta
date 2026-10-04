import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Link, useNavigate } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { DirectoryTargetPicker, type PickedDirectoryTarget } from '../directory/target-picker';
import { buttonClass, Field, inputClass, MutationError } from '../directory/directory-ui';
import { intentFormSchema } from './contracts';
import { intentIdentityKey, useIntentMutation } from './queries';
import { canReadRelationshipContext, useRelationshipContext } from './context-queries';
import { RelationshipContextPanel } from './relationship-context-panel';
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
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Crear intención de contacto</h1>
    <form className="space-y-4" onSubmit={form.handleSubmit(async values => {
      if (contactBlocked) return;
      try { const row = await mutation.mutateAsync({ path: 'contact-intents', body: { purpose: values.purpose,
        ...(values.targetKind === 'ORGANIZATION' ? { organizationId: values.targetId } : { personId: values.targetId }) } }); navigate('/contact-intents/' + row.id); } catch { /* La mutación conserva el borrador y expone el error. */ }
    })}>
      <DirectoryTargetPicker identity={identity} selected={target} onSelect={select} />
      <RelationshipContextPanel identity={identity} target={target} />
      {form.formState.errors.targetId && <p role="alert">{form.formState.errors.targetId.message}</p>}
      <Field label="Propósito" error={form.formState.errors.purpose?.message}><textarea className={inputClass} rows={5} maxLength={5000} {...form.register('purpose')} /></Field>
      <MutationError error={mutation.error} />
      <div className="flex gap-3"><button className={buttonClass} disabled={mutation.isPending || contactBlocked || (!!target && canReadRelationshipContext(identity) && context.isPending)}>{mutation.isPending ? 'Guardando…' : 'Guardar intención'}</button>
        <Link className={buttonClass} to="/contact-intents">Volver al listado</Link></div>
    </form></section>;
}
