import { useId, type ReactNode } from 'react';
import { Button } from '../../components/ui/actions';
import { FieldHelp, FormField, Input, Select, type FieldControlProps } from '../../components/ui/forms';
import { organizationFilterKeys } from './organization-filter.contracts';
import type { AuthIdentity } from '../auth/session';
import { buttonClass, Field, inputClass } from './directory-ui';

// La presentación nueva es optativa: Búsqueda global mantiene su composición actual.
function FilterField({ label, modern, describedBy, children }: { label: string; modern: boolean; describedBy?: string; children: (control: Partial<FieldControlProps>) => ReactNode }) {
  return modern ? <FormField label={label} describedBy={describedBy}>{children}</FormField> : <Field label={label}>{children({})}</Field>;
}
export function OrganizationFilters({ identity, params, change, prefix = '', presentation = 'legacy' }: {
  identity: AuthIdentity; params: URLSearchParams; change: (values: Record<string, string>) => void; prefix?: string; presentation?: 'legacy' | 'modern';
}) {
  const key = (field: string) => prefix ? prefix + field.charAt(0).toUpperCase() + field.slice(1) : field;
  const value = (field: string) => params.get(key(field)) ?? '';
  const update = (field: string, next: string) => change({ [key(field)]: next, page: '1' });
  const canReadCommunications = ['relationships.process.read', 'communications.read'].every(permission => identity.permissions.includes(permission));
  const communicationHelpId = useId();
  const modern = presentation === 'modern';
  const FilterInput = modern ? Input : 'input';
  const FilterSelect = modern ? Select : 'select';
  const communicationHelp = 'Incluye comunicaciones enviadas y recibidas, también invalidadas. Las notas internas y los medios de contacto no cuentan.';
  const clear = () => change(Object.fromEntries([...organizationFilterKeys.map(field => [key(field), '']), [key('verificationStatus'), ''], ['page', '1']]));
  const summary = [
    ...(params.get('name') ? [`Nombre: ${params.get('name')}`] : []),
    ...(value('country') ? [`País: ${value('country')}`] : []),
    `Estado: ${value('status') === 'inactive' ? 'Inactivas' : (value('status') || (prefix || modern ? 'all' : 'active')) === 'all' ? 'Todas' : 'Activas'}`,
    ...(canReadCommunications && value('withCommunications') ? [value('withCommunications') === 'true' ? 'Con comunicaciones históricas' : 'Sin comunicaciones históricas'] : []),
  ].join(' · ');
  return <section aria-label="Filtros de organizaciones" className="min-w-0 space-y-4">
    {prefix && <p>Estos filtros reducen únicamente organizaciones. Personas, procesos y antecedentes de correo conservan su búsqueda.</p>}
    <div className={modern ? 'organizations-secondary-filters' : 'grid min-w-0 gap-4 sm:grid-cols-2'}>
      <FilterField label="País" modern={modern}>{control => <FilterInput {...control} className={modern ? undefined : inputClass} maxLength={150} value={value('country')} onChange={event => update('country', event.target.value)} />}</FilterField>
      <FilterField label={prefix ? 'Estado de organizaciones' : 'Estado'} modern={modern}>{control => <FilterSelect {...control} className={modern ? undefined : inputClass} value={value('status') || (prefix || modern ? 'all' : 'active')} onChange={event => update('status', event.target.value)}>
        <option value="active">Activas</option><option value="inactive">Inactivas</option><option value="all">Todas</option></FilterSelect>}</FilterField>
      {canReadCommunications && <FilterField label="Comunicaciones externas" modern={modern} describedBy={modern ? communicationHelpId : undefined}>{control => <FilterSelect {...control} className={modern ? undefined : inputClass} value={value('withCommunications')} onChange={event => update('withCommunications', event.target.value)}>
        <option value="">Con y sin comunicaciones</option><option value="true">Con comunicaciones históricas</option><option value="false">Sin comunicaciones históricas</option></FilterSelect>}</FilterField>}
    </div>
    {modern && canReadCommunications && <FieldHelp id={communicationHelpId}>{communicationHelp}</FieldHelp>}
    {!modern && canReadCommunications && <p className="text-sm">{communicationHelp}</p>}
    {prefix && <p className="text-sm">Para mostrar organizaciones inactivas, activa también «Incluir fichas inactivas».</p>}
    {modern && prefix && <div className="organizations-filter-footer"><p className="organizations-filter-summary">{summary}</p><Button onClick={clear}>Limpiar filtros de organizaciones</Button></div>}
    {!modern && <button type="button" className={buttonClass} onClick={clear}>Limpiar filtros{prefix ? ' de organizaciones' : ''}</button>}
  </section>;
}
