import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '../../lib/api/client';
import { useSession, type AuthIdentity } from '../auth/session';
import { useDirectoryMutation } from '../directory/queries';
import { MutationError } from '../directory/directory-ui';
import { PageHeader, Surface } from '../../components/ui/layout';
import { FormField, Input, FormSection, FormActions } from '../../components/ui/forms';
import { Button } from '../../components/ui/actions';
import { Alert, QueryFeedback } from '../../components/ui/feedback';
import './settings.css';
const months = z.number().int('Use meses enteros.').min(1, 'El mínimo es 1 mes.').max(120, 'El máximo es 120 meses.');
const verificationSettingsSchema = z.object({ personalVerificationMonths: months, institutionalVerificationMonths: months, version: z.number().int().positive() });
const settingsFormSchema = verificationSettingsSchema.omit({ version: true });
function SettingsForm({ identity, initial, reload, saved }: { identity: AuthIdentity; initial: z.infer<typeof verificationSettingsSchema>; reload: () => Promise<unknown>; saved: () => void }) {
  const form = useForm({ resolver: zodResolver(settingsFormSchema), defaultValues: initial }), mutation = useDirectoryMutation(identity);
  return <form className="space-y-4" onSubmit={form.handleSubmit(async values => {
    try { await mutation.mutateAsync({ path: 'settings/verification', method: 'PUT', body: { ...values, expectedVersion: initial.version } }); saved(); } catch { /* Conservar propuesta y mostrar el error. */ }
  })}>
    <FormSection heading="Vigencia de la información"><FormField label="Información personal (meses)" help="Meses calendario, de 1 a 120." error={form.formState.errors.personalVerificationMonths?.message}>{control => <Input {...control} type="number" min="1" max="120" {...form.register('personalVerificationMonths', { valueAsNumber: true })} />}</FormField>
    <FormField label="Información institucional (meses)" help="Meses calendario, de 1 a 120." error={form.formState.errors.institutionalVerificationMonths?.message}>{control => <Input {...control} type="number" min="1" max="120" {...form.register('institutionalVerificationMonths', { valueAsNumber: true })} />}</FormField>
    </FormSection><MutationError modern error={mutation.error} reload={async () => { await reload(); mutation.reset(); }} />
    <FormActions><Button type="submit" variant="primary" pending={mutation.isPending} disabled={mutation.isPending}>Guardar intervalos</Button></FormActions>
  </form>;
}
export function VerificationSettingsPage() {
  const [saved, setSaved] = useState(false);
  const identity = useSession().data;
  const settings = useQuery({ queryKey: ['directory', identity?.id, 'settings-verification'], enabled: !!identity?.permissions.includes('settings.verification.update'), retry: false,
    queryFn: async ({ signal }) => verificationSettingsSchema.parse(await apiRequest('settings/verification', { signal })) });
  if (!identity?.permissions.includes('settings.verification.update')) return <section className="settings-page"><PageHeader title="Intervalos de verificación" eyebrow="Administración / Configuración"/><Alert tone="danger" role="alert">No tiene permiso para modificar los intervalos de verificación.</Alert></section>;
  return <section className="settings-page"><PageHeader title="Intervalos de verificación" eyebrow="Administración / Configuración" description="Configura la vigencia de la información personal e institucional."/><Surface heading="Intervalos vigentes" className="settings-form-surface">
    <p>Configure de 1 a 120 meses calendario. Verificar requiere una corroboración explícita; modificar información no equivale a verificarla. El cambio se aplica al consultar y no modifica fechas ni evidencias históricas.</p>
    <QueryFeedback pending={settings.isPending} error={settings.isError} retry={settings.refetch} />
    {settings.data && <SettingsForm key={settings.data.version} identity={identity} initial={settings.data} reload={settings.refetch} saved={() => setSaved(true)} />}
    {saved && <Alert tone="success" role="status">Intervalos guardados. Las condiciones se recalculan sin modificar verificaciones históricas.</Alert>}
  </Surface></section>;
}
