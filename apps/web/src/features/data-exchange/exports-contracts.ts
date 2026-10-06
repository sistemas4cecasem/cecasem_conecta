export type ExportType = 'organizations' | 'contacts' | 'processes' | 'opportunities';
export type ExportFilters = Partial<Record<'name' | 'country' | 'categoryId' | 'organizationStatus' | 'verificationStatus' | 'withCommunications' |
  'personStatus' | 'contactType' | 'relationStatus' | 'processState' | 'createdByUserId' | 'processOrganizationId' | 'processPersonId' |
  'opportunityStatus' | 'opportunityOrganizationId' | 'opportunityProcessId', string>>;
export interface ExportPreview { type: ExportType; count: number; unit: 'registros' | 'personas' }

export const exportTypes: { type: ExportType; label: string; requiredPermission: string }[] = [
  { type: 'organizations', label: 'Organizaciones', requiredPermission: 'directory.read' },
  { type: 'contacts', label: 'Contactos', requiredPermission: 'directory.read' },
  { type: 'processes', label: 'Procesos', requiredPermission: 'relationships.process.read' },
  { type: 'opportunities', label: 'Oportunidades', requiredPermission: 'opportunities.read' },
];

export function exportFileName(type: ExportType, now = new Date()): string {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return `cecasem-${type}-${date}.xlsx`;
}

const labels: Partial<Record<keyof ExportFilters, Record<string, string>>> = {
  organizationStatus: { active: 'Activas', inactive: 'Inactivas', all: 'Todas' },
  personStatus: { active: 'Activas', inactive: 'Inactivas', all: 'Todas' },
  verificationStatus: { CURRENT: 'Verificación vigente', REVIEW_DUE: 'Revisión pendiente', NEVER_VERIFIED: 'Sin verificar' },
  withCommunications: { true: 'Con comunicaciones', false: 'Sin comunicaciones' },
  contactType: { EMAIL: 'Correo electrónico', PHONE: 'Teléfono', LINKEDIN: 'LinkedIn', WEBSITE: 'Sitio web', WEB_FORM: 'Formulario web', OTHER: 'Otro' },
  relationStatus: { current: 'Vínculos vigentes', historical: 'Vínculos históricos', all: 'Todos los vínculos' },
  processState: { PREPARATION: 'En preparación', IN_PROGRESS: 'En curso', WAITING_RESPONSE: 'Esperando respuesta', NEGOTIATION: 'En negociación', CLOSED: 'Cerrados', all: 'Todos los estados' },
  opportunityStatus: { PENDING_REVIEW: 'Pendiente de revisión', PREPARING: 'En preparación', SUBMITTED: 'Postulada', DISCARDED: 'Descartada', FINISHED: 'Finalizada', all: 'Todos los estados' },
};
const fieldLabels: Partial<Record<keyof ExportFilters, string>> = {
  name: 'Nombre contiene', country: 'País', categoryId: 'Identificador de categoría', organizationStatus: 'Estado de organización',
  verificationStatus: 'Verificación', withCommunications: 'Comunicaciones', personStatus: 'Estado de persona', contactType: 'Tipo de medio',
  relationStatus: 'Vínculos institucionales', processState: 'Estado de proceso', createdByUserId: 'Creador', processOrganizationId: 'Organización',
  processPersonId: 'Persona', opportunityStatus: 'Estado de oportunidad', opportunityOrganizationId: 'Organización', opportunityProcessId: 'Proceso',
};

export function filterSummary(type: ExportType, filters: ExportFilters): string {
  const allowed = type === 'organizations' ? ['name', 'country', 'categoryId', 'organizationStatus', 'verificationStatus', 'withCommunications'] :
    type === 'contacts' ? ['name', 'personStatus', 'contactType', 'relationStatus'] : type === 'processes' ? ['processState', 'processOrganizationId', 'processPersonId', 'createdByUserId'] :
      ['opportunityStatus', 'opportunityOrganizationId', 'opportunityProcessId'];
  const entries = allowed.flatMap(key => {
    const value = filters[key as keyof ExportFilters];
    if (value === undefined || value === '') return [];
    const label = fieldLabels[key as keyof ExportFilters] ?? key;
    const text = labels[key as keyof ExportFilters]?.[value] ?? value;
    return [`${label}: ${text}`];
  });
  return entries.length ? entries.join(' · ') : 'Sin filtros adicionales';
}
