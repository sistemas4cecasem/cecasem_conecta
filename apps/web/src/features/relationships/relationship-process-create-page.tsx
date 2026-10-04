import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Link, useNavigate } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { DirectoryTargetPicker, type PickedDirectoryTarget } from '../directory/target-picker';
import { buttonClass, Field, inputClass, MutationError } from '../directory/directory-ui';
import { processCreateSchema } from './process-contracts';
import { processIdentityKey, useProcessMutation } from './process-queries';
import { canReadRelationshipContext, useRelationshipContext } from './context-queries';
import { RelationshipContextPanel } from './relationship-context-panel';
export function RelationshipProcessCreatePage() {
  const identity = useSession().data;
  if (!identity?.permissions.includes('relationships.process.create')) return <p role="alert">No tienes permiso para crear procesos.</p>;
  return <ProcessForm key={processIdentityKey(identity).join(':')} identity={identity} />;
}
function ProcessForm({ identity }: { identity: AuthIdentity }) {
  const navigate = useNavigate(), mutation = useProcessMutation(identity);
  const [target, setTarget] = useState<PickedDirectoryTarget | null>(null);
  const context = useRelationshipContext(identity, target);
  const contactBlocked = context.data?.contactAllowed === false;
  const form = useForm<z.infer<typeof processCreateSchema>>({ resolver: zodResolver(processCreateSchema), defaultValues: { purpose: '', targetId: '', targetKind: 'ORGANIZATION' } });
  function select(value: PickedDirectoryTarget | null) {
    setTarget(value); form.setValue('targetId', value?.id ?? '', { shouldValidate: true }); form.setValue('targetKind', value?.kind ?? 'ORGANIZATION');
  }
  return <section className="min-w-0 w-full space-y-4"><h1 className="text-2xl font-semibold">Crear proceso de relación</h1><p>Comenzará en preparación. Quedarás registrado como participante creador.</p>
    <form className="space-y-4" onSubmit={form.handleSubmit(async values => {
      if (contactBlocked) return;
      try { const row = await mutation.mutateAsync({ path: 'relationship-processes', body: { purpose: values.purpose,
        ...(values.targetKind === 'ORGANIZATION' ? { organizationId: values.targetId } : { personId: values.targetId }) } }); navigate('/relationship-processes/' + row.id); } catch { /* Se conserva el borrador. */ }
    })}>
      <DirectoryTargetPicker identity={identity} selected={target} onSelect={select} />
      <RelationshipContextPanel identity={identity} target={target} />
      {form.formState.errors.targetId && <p role="alert">{form.formState.errors.targetId.message}</p>}
      <Field label="Propósito" error={form.formState.errors.purpose?.message}><textarea className={inputClass} rows={5} maxLength={5000} {...form.register('purpose')} /></Field>
      <MutationError error={mutation.error} />
      <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={mutation.isPending || contactBlocked || (!!target && canReadRelationshipContext(identity) && context.isPending)}>{mutation.isPending ? 'Guardando…' : 'Guardar proceso'}</button><Link className={buttonClass} to="/relationship-processes">Volver al listado</Link></div>
    </form></section>;
}
