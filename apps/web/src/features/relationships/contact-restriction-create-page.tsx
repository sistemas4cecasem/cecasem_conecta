import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSession, type AuthIdentity } from '../auth/session';
import { DirectoryTargetPicker, type PickedDirectoryTarget } from '../directory/target-picker';
import { buttonClass, Field, inputClass, MutationError } from '../directory/directory-ui';
import { restrictionCreateSchema } from './restriction-contracts';
import { restrictionIdentityKey, restrictionIdentityMatches, useRestrictionMutation } from './restriction-queries';
export function ContactRestrictionCreatePage() {
  const identity = useSession().data;
  if (!identity?.permissions.includes('relationships.restriction.create')) return <p role="alert">No tienes permiso para registrar restricciones.</p>;
  return <RestrictionForm key={restrictionIdentityKey(identity).join(':')} identity={identity} />;
}
function RestrictionForm({ identity }: { identity: AuthIdentity }) {
  const navigate = useNavigate(), mutation = useRestrictionMutation(identity), client = useQueryClient();
  const [target, setTarget] = useState<PickedDirectoryTarget | null>(null), [confirmation, setConfirmation] = useState<z.infer<typeof restrictionCreateSchema> | null>(null);
  const form = useForm<z.infer<typeof restrictionCreateSchema>>({ resolver: zodResolver(restrictionCreateSchema), defaultValues: { reason: '', targetId: '', targetKind: 'ORGANIZATION' } });
  function select(value: PickedDirectoryTarget | null) { setTarget(value); setConfirmation(null); form.setValue('targetId', value?.id ?? '', { shouldValidate: true }); form.setValue('targetKind', value?.kind ?? 'ORGANIZATION'); }
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Registrar restricción de no contacto</h1>
    <p role="alert">Esta decisión institucional impedirá nuevas intenciones, su conversión y nuevos procesos para el objetivo seleccionado. Regístrala solo ante una solicitud explícita de no contacto.</p>
    <form className="space-y-4" onSubmit={form.handleSubmit(values => setConfirmation(values))}>
      <DirectoryTargetPicker identity={identity} selected={target} onSelect={select} />
      {form.formState.errors.targetId && <p role="alert">{form.formState.errors.targetId.message}</p>}
      <Field label="Motivo de restricción" error={form.formState.errors.reason?.message}><textarea className={inputClass} rows={5} maxLength={5000} {...form.register('reason', { onChange: () => setConfirmation(null) })} /></Field>
      <button className={buttonClass} disabled={mutation.isPending}>Revisar restricción</button>
    </form>
    {confirmation && <section aria-label="Confirmar registro" className="space-y-3 rounded border p-3"><p>¿Registrar la restricción para {target?.label}?</p><p className="whitespace-pre-wrap break-words">{confirmation.reason}</p>
      <button className={buttonClass} disabled={mutation.isPending || !!mutation.error} onClick={() => {
        void mutation.mutateAsync({ path: 'contact-restrictions', body: { reason: confirmation.reason, ...(confirmation.targetKind === 'ORGANIZATION' ? { organizationId: confirmation.targetId } : { personId: confirmation.targetId }) } })
          .then(row => { if (restrictionIdentityMatches(client, identity)) navigate('/contact-restrictions/' + row.id); }).catch(() => undefined);
      }}>Confirmar registro</button>{' '}<button className={buttonClass} disabled={mutation.isPending} onClick={() => { setConfirmation(null); mutation.reset(); }}>Volver sin registrar</button></section>}
    <MutationError error={mutation.error} /><Link className={buttonClass} to="/contact-restrictions">Volver al listado</Link>
  </section>;
}
