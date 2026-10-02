import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '../../lib/api/client';
import { useSession, type AuthIdentity } from '../auth/session';
import { useDirectoryMutation } from '../directory/queries';
import { Field, inputClass, buttonClass, MutationError, QueryState } from '../directory/directory-ui';
const months = z.number().int('Use meses enteros.').min(1, 'El mínimo es 1 mes.').max(120, 'El máximo es 120 meses.');
const verificationSettingsSchema = z.object({ personalVerificationMonths: months, institutionalVerificationMonths: months, version: z.number().int().positive() });
const settingsFormSchema = verificationSettingsSchema.omit({ version: true });
function SettingsForm({ identity, initial, reload, saved }: { identity: AuthIdentity; initial: z.infer<typeof verificationSettingsSchema>; reload: () => Promise<unknown>; saved: () => void }) {
  const form = useForm({ resolver: zodResolver(settingsFormSchema), defaultValues: initial }), mutation = useDirectoryMutation(identity);
  return <form className="space-y-4" onSubmit={form.handleSubmit(async values => {
    try { await mutation.mutateAsync({ path: 'settings/verification', method: 'PUT', body: { ...values, expectedVersion: initial.version } }); saved(); } catch { /* Conservar propuesta y mostrar el error. */ }
  })}>
    <Field label="Información personal (meses)" error={form.formState.errors.personalVerificationMonths?.message}><input type="number" min="1" max="120" className={inputClass} {...form.register('personalVerificationMonths', { valueAsNumber: true })} /></Field>
    <Field label="Información institucional (meses)" error={form.formState.errors.institutionalVerificationMonths?.message}><input type="number" min="1" max="120" className={inputClass} {...form.register('institutionalVerificationMonths', { valueAsNumber: true })} /></Field>
    <MutationError error={mutation.error} reload={async () => { await reload(); mutation.reset(); }} />
    <button className={buttonClass} disabled={mutation.isPending}>Guardar intervalos</button>
  </form>;
}
export function VerificationSettingsPage() {
  const [saved, setSaved] = useState(false);
  const identity = useSession().data;
  const settings = useQuery({ queryKey: ['directory', identity?.id, 'settings-verification'], enabled: !!identity?.permissions.includes('settings.verification.update'), retry: false,
    queryFn: async ({ signal }) => verificationSettingsSchema.parse(await apiRequest('settings/verification', { signal })) });
  if (!identity?.permissions.includes('settings.verification.update')) return <p role="alert">No tiene permiso para modificar los intervalos de verificación.</p>;
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Intervalos de verificación</h1>
    <p>Configure de 1 a 120 meses calendario. El cambio se aplica al consultar y no modifica fechas ni evidencias históricas.</p>
    <QueryState pending={settings.isPending} error={settings.isError} retry={settings.refetch} />
    {settings.data && <SettingsForm key={settings.data.version} identity={identity} initial={settings.data} reload={settings.refetch} saved={() => setSaved(true)} />}
    {saved && <p role="status">Intervalos guardados. Las condiciones se recalculan sin modificar verificaciones históricas.</p>}
  </section>;
}
