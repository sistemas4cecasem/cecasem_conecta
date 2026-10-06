import { ContactType, ImportedHistoryKind, type DataImportRecordKind } from '../../../generated/prisma/client';
import { normalizeEmail } from '../../users/identity-normalization';
import { institutionalText, website } from '../../directory/directory.rules';
import { personFields } from '../../directory/people.rules';
import { contactFields, contactContext } from '../../directory/contacts.rules';
import { DataImportError } from './import.errors';
import type { InspectedCell, ReadableRow } from './xlsx-inspector';

export const IMPORT_FIELDS = {
  ORGANIZATION: ['name', 'country', 'alias', 'description', 'officialWebsite'],
  PERSON: ['displayName', 'givenNames', 'familyNames'],
  CONTACT: ['contactType', 'contactValue', 'organizationName', 'personDisplayName', 'label', 'notes'],
  HISTORICAL_RECORD: ['kind', 'occurredOn', 'email', 'subject', 'body', 'originalObservation', 'organizationName', 'personDisplayName'],
} as const satisfies Record<DataImportRecordKind, readonly string[]>;

export type ImportColumnMapping = Record<string, number>;
export interface ImportIssue { field: string | null; message: string; value: string | null }
export interface NormalizedImportRow {
  rowNumber: number;
  status: 'READY' | 'NEEDS_REVIEW' | 'INVALID';
  sourceValues: Record<string, string | number | boolean | null>;
  normalizedValues: Record<string, string | null> | null;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  matches: { field: string; kind: string; id: string; label: string; score: number | null }[];
}

function scalar(cell: InspectedCell | undefined): string | null {
  if (!cell || cell.value === null || cell.cellType === 'FORMULA' || cell.cellType === 'UNSUPPORTED' || cell.cellType === 'EMPTY') return null;
  return String(cell.value).trim() || null;
}

function dateOnly(cell: InspectedCell | undefined): string | null {
  const value = scalar(cell);
  if (!value) return null;
  if (cell?.cellType === 'DATE') {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('La fecha de Excel no es válida.');
    return date.toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error('Usa una fecha civil ISO AAAA-MM-DD; no se adivinan formatos ambiguos.');
  const date = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('La fecha no existe en el calendario.');
  return value;
}

export function validateColumnMapping(kind: DataImportRecordKind, headers: InspectedCell[], mapping: ImportColumnMapping): { mapped: ImportColumnMapping; unknownHeaders: string[] } {
  const allowed = new Set<string>(IMPORT_FIELDS[kind]);
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping) || !Object.keys(mapping).length) throw new DataImportError('INVALID_UPLOAD', 'Selecciona las columnas que correspondan a cada campo.');
  const entries = Object.entries(mapping);
  if (entries.some(([field, column]) => !allowed.has(field) || !Number.isInteger(column) || column < 1)) throw new DataImportError('INVALID_UPLOAD', 'La asignación contiene un campo o columna no admitidos.');
  if (new Set(entries.map(([, column]) => column)).size !== entries.length) throw new DataImportError('DUPLICATE_MAPPING', 'Una columna no puede asignarse a más de un campo.');
  const available = new Set(headers.map(header => header.column));
  if (entries.some(([, column]) => !available.has(column))) throw new DataImportError('INVALID_UPLOAD', 'Una columna asignada no existe en la fila de encabezados seleccionada.');
  const requiredFields = kind === 'ORGANIZATION' ? ['name'] : kind === 'PERSON' ? [] : kind === 'CONTACT' ? ['contactType', 'contactValue'] : [];
  if (requiredFields.some(field => !Object.hasOwn(mapping, field))) throw new DataImportError('INVALID_UPLOAD', 'Asigna las columnas obligatorias para este tipo de registro.');
  const known = new Set(entries.map(([, column]) => column));
  return { mapped: mapping, unknownHeaders: headers.filter(header => !known.has(header.column)).map(header => scalar(header) ?? `Columna ${header.column}`) };
}

function sourceProjection(row: ReadableRow, headers: InspectedCell[]): Record<string, string | number | boolean | null> {
  const labels = new Map(headers.map(header => [header.column, scalar(header) ?? `Columna ${header.column}`]));
  const counts = new Map<string, number>();
  for (const label of labels.values()) counts.set(label, (counts.get(label) ?? 0) + 1);
  const entries: [string, string | number | boolean | null][] = row.cells.map(cell => {
    const label = labels.get(cell.column) ?? `Columna ${cell.column}`;
    const key = (counts.get(label) ?? 0) > 1 ? `${label} (columna ${cell.column})` : label;
    const value = cell.cellType === 'FORMULA' || cell.cellType === 'UNSUPPORTED' ? null : cell.value;
    return [key, value];
  });
  return Object.fromEntries(entries);
}

export function normalizeImportRow(kind: DataImportRecordKind, row: ReadableRow, headers: InspectedCell[], mapping: ImportColumnMapping): NormalizedImportRow {
  const cells = new Map(row.cells.map(cell => [cell.column, cell]));
  const errors: ImportIssue[] = [], warnings: ImportIssue[] = [];
  const values: Record<string, string | null> = {};
  for (const [field, column] of Object.entries(mapping)) {
    const cell = cells.get(column);
    if (cell?.cellType === 'FORMULA') errors.push({ field, message: 'Las fórmulas no se ejecutan ni se importan; reemplaza la celda por un valor.', value: null });
    else if (cell?.cellType === 'UNSUPPORTED') errors.push({ field, message: 'El tipo de celda no es compatible.', value: null });
    const raw = scalar(cell);
    if (raw !== null) values[field] = raw;
  }
  const dateCell = cells.get(mapping.occurredOn);
  const rawDate = scalar(dateCell);
  if (rawDate && dateCell?.cellType !== 'DATE' && !/^\d{4}-\d{2}-\d{2}$/u.test(rawDate)) {
    warnings.push({ field: 'occurredOn', message: 'Fecha ambigua: se conserva el valor original y no se usará como fecha. Corrige el Excel o deja la fecha sin asignar.', value: rawDate.slice(0, 160) });
  }
  const emailField = kind === 'CONTACT' ? 'contactValue' : kind === 'HISTORICAL_RECORD' ? 'email' : null;
  const rawEmail = emailField ? values[emailField] : null;
  if (rawEmail && /[,;\n\r]/u.test(rawEmail)) {
    warnings.push({ field: emailField, message: 'La celda parece contener varios valores. No se separarán automáticamente; revisa el valor o corrígelo en el Excel.', value: rawEmail.slice(0, 160) });
  }
  let normalized: Record<string, string | null> | null = null;
  try {
    if (kind === 'ORGANIZATION') {
      normalized = { name: institutionalText(values.name, 250, true)!, country: institutionalText(values.country, 150), alias: institutionalText(values.alias, 150),
        description: institutionalText(values.description, 5000), officialWebsite: website(values.officialWebsite) };
    } else if (kind === 'PERSON') {
      const names = { givenNames: institutionalText(values.givenNames, 150), familyNames: institutionalText(values.familyNames, 150) };
      const displayName = institutionalText(values.displayName, 250) ?? [names.givenNames, names.familyNames].filter(Boolean).join(' ');
      if (!displayName) throw new Error('La fila necesita un nombre conocido de la persona.');
      normalized = personFields({ ...names, displayName });
    } else if (kind === 'CONTACT') {
      const type = values.contactType as ContactType;
      if (!Object.values(ContactType).includes(type)) throw new Error('El tipo de contacto debe coincidir con un tipo admitido por CECASEM Conecta.');
      const contact = contactFields({ type, value: values.contactValue ?? '' , label: values.label });
      const organizationName = institutionalText(values.organizationName, 250);
      const personDisplayName = institutionalText(values.personDisplayName, 250);
      if (!organizationName && !personDisplayName) throw new Error('El contacto debe vincularse a una organización o persona indicada en la misma fila.');
      const context = contactContext({ notes: values.notes, sourceDescription: 'Importación Excel histórica' });
      normalized = { ...contact, organizationName, personDisplayName, notes: context.notes };
    } else {
      const kindValue = (values.kind ?? '').trim().toUpperCase();
      const kindAliases: Record<string, ImportedHistoryKind> = { SENT: ImportedHistoryKind.SENT, ENVIADO: ImportedHistoryKind.SENT,
        RECEIVED: ImportedHistoryKind.RECEIVED, RECIBIDO: ImportedHistoryKind.RECEIVED, OTHER: ImportedHistoryKind.OTHER,
        OTRO: ImportedHistoryKind.OTHER, UNKNOWN: ImportedHistoryKind.UNKNOWN, DESCONOCIDO: ImportedHistoryKind.UNKNOWN };
      if (kindValue && !kindAliases[kindValue]) throw new Error('El tipo histórico debe indicar SENT/ENVIADO, RECEIVED/RECIBIDO, OTHER/OTRO o UNKNOWN/DESCONOCIDO.');
      const occurredOn = dateOnly(cells.get(mapping.occurredOn));
      const email = values.email ? normalizeEmail(values.email) : null;
      const organizationName = institutionalText(values.organizationName, 250);
      const personDisplayName = institutionalText(values.personDisplayName, 250);
      const subject = institutionalText(values.subject, 998);
      const body = institutionalText(values.body, 5000);
      const originalObservation = institutionalText(values.originalObservation, 5000);
      if (!kindValue && !occurredOn && !email && !organizationName && !personDisplayName && !subject && !body && !originalObservation) throw new Error('No hay datos que demuestren un antecedente histórico.');
      normalized = { kind: kindAliases[kindValue] ?? ImportedHistoryKind.UNKNOWN, occurredOn, email, organizationName, personDisplayName, subject, body, originalObservation };
      if (!occurredOn) warnings.push({ field: 'occurredOn', message: 'La fecha histórica queda desconocida.', value: null });
      if (!email) warnings.push({ field: 'email', message: 'No se registró un correo exacto.', value: null });
      if (!body) warnings.push({ field: 'body', message: 'El cuerpo original queda ausente; no se completará.', value: null });
    }
  } catch (error) {
    errors.push({ field: null, message: error instanceof Error ? error.message : 'El valor no es válido.', value: null });
  }
  if (Object.values(values).every(value => value === null || value === '')) warnings.push({ field: null, message: 'La fila solo contiene celdas vacías en las columnas asignadas.', value: null });
  return { rowNumber: row.rowNumber, status: errors.length ? 'INVALID' : warnings.length ? 'NEEDS_REVIEW' : 'READY',
    sourceValues: sourceProjection(row, headers), normalizedValues: errors.length ? null : normalized, errors, warnings, matches: [] };
}
