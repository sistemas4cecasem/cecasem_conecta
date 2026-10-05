import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '../../lib/api/client';
import { useSession } from '../auth/session';
import { Field, inputClass, buttonClass, MutationError, QueryState } from '../directory/directory-ui';

const interval = z.number().int('Use días enteros.').min(1,'El mínimo es 1 día.').max(36500,'El límite técnico es 36500 días.');
const settingsSchema = z.object({ intervalDays: interval, version: z.number().int().positive() });
const formSchema = settingsSchema.omit({ version: true });
function ReminderSettingsForm({ initial, saved, reload }: { initial: z.infer<typeof settingsSchema>; saved: () => Promise<void>; reload: () => Promise<unknown> }) {
  const form = useForm({ resolver: zodResolver(formSchema), defaultValues: { intervalDays: initial.intervalDays } });
  const mutation = useMutation({ mutationFn: (values: z.infer<typeof formSchema>) => apiRequest('settings/reminders', {
    method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...values,expectedVersion:initial.version}),
  }), retry:false });
  return <form className="space-y-4" onSubmit={form.handleSubmit(async values => {
    try { await mutation.mutateAsync(values); await saved(); } catch { /* Mantener propuesta para corregir o recargar. */ }
  })}>
    <Field label="Intervalo de inactividad (días)" error={form.formState.errors.intervalDays?.message}><input type="number" min="1" max="36500" className={inputClass} {...form.register('intervalDays',{valueAsNumber:true})} /></Field>
    <MutationError error={mutation.error} reload={async () => { await reload(); mutation.reset(); }} />
    <button className={buttonClass} disabled={mutation.isPending}>{mutation.isPending ? 'Guardando…' : 'Guardar intervalo'}</button>
  </form>;
}
export function ReminderSettingsPage() {
  const identity = useSession().data, authorized = !!identity?.permissions.includes('settings.reminders.update');
  const [saved,setSaved] = useState(false);
  const settings = useQuery({queryKey:['reminder-settings',identity?.id,identity?.role,authorized],enabled:authorized,retry:false,
    queryFn:async ({signal}) => settingsSchema.parse(await apiRequest('settings/reminders',{signal}))});
  if (!authorized) return <p role="alert">No tiene permiso para configurar los recordatorios.</p>;
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Recordatorios de inactividad</h1>
    <p>El intervalo inicial es 7 días. Se aplica a intenciones y procesos activos, con un único aviso por ciclo. Guardar no modifica sus estados ni los recordatorios históricos.</p>
    <QueryState pending={settings.isPending} error={settings.isError} retry={settings.refetch} />
    {settings.data && <ReminderSettingsForm key={settings.data.version} initial={settings.data} reload={settings.refetch} saved={async () => { await settings.refetch(); setSaved(true); }} />}
    {saved && <p role="status">Intervalo guardado. Se aplicará en el próximo barrido y el cambio quedó auditado.</p>}
  </section>;
}
