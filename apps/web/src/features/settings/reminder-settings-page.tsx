import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '../../lib/api/client';
import { useSession } from '../auth/session';
import { MutationError } from '../directory/directory-ui';
import { PageHeader, Surface } from '../../components/ui/layout';
import { FormField, Input, FormSection, FormActions } from '../../components/ui/forms';
import { Button } from '../../components/ui/actions';
import { Alert, QueryFeedback } from '../../components/ui/feedback';
import './settings.css';

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
    <FormSection heading="Intervalo de inactividad"><FormField label="Intervalo de inactividad (días)" help="Días enteros, de 1 a 36500." error={form.formState.errors.intervalDays?.message}>{control => <Input {...control} type="number" min="1" max="36500" {...form.register('intervalDays',{valueAsNumber:true})} />}</FormField>
    </FormSection><MutationError modern error={mutation.error} reload={async () => { await reload(); mutation.reset(); }} />
    <FormActions><Button type="submit" variant="primary" pending={mutation.isPending} disabled={mutation.isPending}>{mutation.isPending ? 'Guardando…' : 'Guardar intervalo'}</Button></FormActions>
  </form>;
}
export function ReminderSettingsPage() {
  const identity = useSession().data, authorized = !!identity?.permissions.includes('settings.reminders.update');
  const [saved,setSaved] = useState(false);
  const settings = useQuery({queryKey:['reminder-settings',identity?.id,identity?.role,authorized],enabled:authorized,retry:false,
    queryFn:async ({signal}) => settingsSchema.parse(await apiRequest('settings/reminders',{signal}))});
  if (!authorized) return <section className="settings-page"><PageHeader title="Recordatorios de inactividad" eyebrow="Administración / Configuración"/><Alert tone="danger" role="alert">No tiene permiso para configurar los recordatorios.</Alert></section>;
  return <section className="settings-page"><PageHeader title="Recordatorios de inactividad" eyebrow="Administración / Configuración" description="Configura el intervalo de aviso por inactividad."/><Surface heading="Intervalo vigente" className="settings-form-surface">
    <p>El intervalo se expresa en días. Se aplica a intenciones y procesos activos, con un único aviso por ciclo. Guardar no modifica sus estados ni los recordatorios históricos.</p>
    <QueryFeedback pending={settings.isPending} error={settings.isError} retry={settings.refetch} />
    {settings.data && <ReminderSettingsForm key={settings.data.version} initial={settings.data} reload={settings.refetch} saved={async () => { await settings.refetch(); setSaved(true); }} />}
    {saved && <Alert tone="success" role="status">Intervalo guardado. Se aplicará en el próximo barrido y el cambio quedó auditado.</Alert>}
  </Surface></section>;
}
