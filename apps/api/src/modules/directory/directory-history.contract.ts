import type { Prisma } from '../../generated/prisma/client';

export type HistoryValue = string | boolean | string[] | null;
export type HistoryReferenceKind = 'organization' | 'category' | 'person' | 'contactMethod';
export interface HistoryReference { id: string; kind: HistoryReferenceKind; label: string | null }
export interface HistoryReplacement { previous: HistoryReference; next: HistoryReference }
export interface HistorySnapshot { previous: HistoryReference[]; next: HistoryReference[]; related: HistoryReference[]; replacement: HistoryReplacement | null }
export const historyObjectTypes = {
  organizationId: 'ORGANIZATION', categoryId: 'CATEGORY', personId: 'PERSON', personRelationId: 'PERSON_ORGANIZATION_RELATION',
  contactMethodId: 'CONTACT_METHOD', personContactId: 'PERSON_CONTACT', organizationContactId: 'ORGANIZATION_CONTACT',
} as const;
export type HistoryObjectType = typeof historyObjectTypes[keyof typeof historyObjectTypes];
const fieldLabels: Record<string, string> = {
  name: 'Nombre', country: 'País', alias: 'Sigla o nombre alternativo', description: 'Descripción', officialWebsite: 'Sitio oficial',
  parentId: 'Organización matriz', categoryIds: 'Categorías', isActive: 'Estado', displayName: 'Nombre de presentación',
  givenNames: 'Nombres', familyNames: 'Apellidos', positionTitle: 'Cargo', area: 'Área o función', isCurrent: 'Vigencia',
  startDate: 'Fecha inicial', endDate: 'Fecha final', sourceDescription: 'Fuente', sourceUrl: 'URL de fuente', notes: 'Observaciones',
  value: 'Valor del medio', label: 'Etiqueta del medio', condition: 'Condición global del medio',
  associationCreated: 'Asociación de contacto añadida', relationCreated: 'Vínculo institucional añadido',
};
export function historyFieldLabel(field: string): string {
  const label = fieldLabels[field];
  if (!label) throw new Error('Campo de historial sin representación pública.');
  return label;
}
export function historicalValue(value: Prisma.JsonValue): HistoryValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value;
  throw new Error('Valor de historial incompatible.');
}
export function referenceIds(field: string, value: HistoryValue): { kind: HistoryReferenceKind; ids: string[] } | null {
  if (field === 'categoryIds') return { kind: 'category', ids: Array.isArray(value) ? value : [] };
  const kind = field === 'parentId' || field === 'relationCreated' ? 'organization' : field === 'associationCreated' ? 'contactMethod' : null;
  return kind ? { kind, ids: typeof value === 'string' ? [value] : [] } : null;
}
function reference(item: unknown): item is HistoryReference {
  return typeof item === 'object' && item !== null &&
    'id' in item && typeof item.id === 'string' && 'label' in item && (item.label === null || typeof item.label === 'string') &&
    'kind' in item && ['organization', 'category', 'person', 'contactMethod'].includes(String(item.kind));
}
function references(value: unknown): value is HistoryReference[] {
  return Array.isArray(value) && value.every(reference);
}
export function readHistorySnapshot(value: Prisma.JsonValue | null): HistorySnapshot | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!references(value.previous) || !references(value.next) || !references(value.related)) return null;
  const replacement = value.replacement;
  return { previous: value.previous, next: value.next, related: value.related,
    replacement: typeof replacement === 'object' && replacement !== null && !Array.isArray(replacement) &&
      reference(replacement.previous) && reference(replacement.next) ? { previous: replacement.previous, next: replacement.next } : null };
}
export function changeContract(row: { field: string; previousValue: Prisma.JsonValue; newValue: Prisma.JsonValue; referenceSnapshot: Prisma.JsonValue | null }) {
  const previousValue = historicalValue(row.previousValue), newValue = historicalValue(row.newValue);
  const snapshot = readHistorySnapshot(row.referenceSnapshot);
  // Entradas anteriores conservan sus IDs, pero jamás reciben una etiqueta actual presentada como histórica.
  const resolve = (value: HistoryValue, saved: HistoryReference[] | undefined) => {
    const referenced = referenceIds(row.field, value);
    return referenced ? referenced.ids.map(id => saved?.find(ref => ref.id === id && ref.kind === referenced.kind) ?? { id, kind: referenced.kind, label: null }) : [];
  };
  const previousReferences = resolve(previousValue, snapshot?.previous), newReferences = resolve(newValue, snapshot?.next);
  return { field: row.field, label: historyFieldLabel(row.field), previousValue, newValue, previousReferences, newReferences,
    added: newReferences.filter(ref => !previousReferences.some(before => before.id === ref.id)),
    removed: previousReferences.filter(ref => !newReferences.some(next => next.id === ref.id)) };
}
