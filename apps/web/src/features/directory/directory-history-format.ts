import type { HistoryChange, HistoryReference, HistoryOperation } from './contracts';
export const historyObjectLabels: Record<HistoryOperation['objectType'], string> = {
  ORGANIZATION: 'Organización', CATEGORY: 'Categoría', PERSON: 'Persona', PERSON_ORGANIZATION_RELATION: 'Vínculo persona–organización',
  CONTACT_METHOD: 'Medio de contacto', PERSON_CONTACT: 'Asociación persona–contacto', ORGANIZATION_CONTACT: 'Asociación organización–contacto',
};
export function referenceLabel(reference: HistoryReference): string {
  return reference.label ?? 'Referencia conservada (etiqueta histórica no registrada)';
}
export function historyValueLabel(change: HistoryChange, side: 'previous' | 'new'): string {
  const value = side === 'previous' ? change.previousValue : change.newValue;
  const refs = side === 'previous' ? change.previousReferences : change.newReferences;
  if (value === null || value === '') return 'Sin dato';
  if (refs.length) return refs.map(referenceLabel).join(', ');
  if (Array.isArray(value)) return value.length ? 'Referencias conservadas (etiquetas históricas no registradas)' : 'Sin categorías';
  if (typeof value === 'boolean') return change.field === 'isCurrent' ? (value ? 'Vigente' : 'Finalizado') : (value ? 'Activa' : 'Inactiva');
  if (change.field === 'condition') return value === 'USABLE' ? 'Disponible' : 'No utilizable (reportado)';
  if (['parentId', 'relationCreated', 'associationCreated'].includes(change.field)) return 'Referencia conservada (etiqueta histórica no registrada)';
  return value;
}
export function historyOperationLabel(operation: HistoryOperation): string {
  if (operation.replacement) return 'Sustitución de contacto';
  if (operation.changes.some(change => change.field === 'relationCreated')) return 'Alta de vínculo institucional';
  if (operation.changes.some(change => change.field === 'associationCreated')) return 'Alta de asociación de contacto';
  return 'Modificación';
}
