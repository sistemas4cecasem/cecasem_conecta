import { DataImportRecordKind } from '../../../generated/prisma/client';
import type { InspectedCell, ReadableRow } from './xlsx-inspector';
import { normalizeImportRow, validateColumnMapping } from './import-mapping';

function row(rowNumber: number, values: (string | number | null)[], type: InspectedCell['cellType'] = 'TEXT'): ReadableRow {
  return { rowNumber, cells: values.flatMap((value, index) => value === null ? [] : [{ column: index + 1, value, cellType: type }]) };
}
const headers = ['Organización', 'Fecha', 'Correo', 'Tipo'].map((value, index) => ({ column: index + 1, value, cellType: 'TEXT' as const }));

describe('import column mapping and row normalization', () => {
  it('requires an explicit, unique mapping to columns that exist and warns about unmapped headers', () => {
    expect(validateColumnMapping(DataImportRecordKind.HISTORICAL_RECORD, headers, { email: 3, occurredOn: 2 })).toEqual({
      mapped: { email: 3, occurredOn: 2 }, unknownHeaders: ['Organización', 'Tipo'],
    });
    expect(() => validateColumnMapping(DataImportRecordKind.ORGANIZATION, headers, { name: 1, country: 1 })).toThrow();
    expect(() => validateColumnMapping(DataImportRecordKind.ORGANIZATION, headers, { name: 99 })).toThrow();
  });

  it('preserves incomplete history with nullable facts and does not invent a recipient, body, date or direction', () => {
    const result = normalizeImportRow(DataImportRecordKind.HISTORICAL_RECORD, row(3, ['Fundación Ejemplo', null, null, '']), headers,
      { organizationName: 1 });
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.normalizedValues).toEqual({ kind: 'UNKNOWN', occurredOn: null, email: null, organizationName: 'Fundación Ejemplo',
      personDisplayName: null, subject: null, body: null, originalObservation: null });
    expect(result.warnings.map(item => item.field)).toEqual(['occurredOn', 'email', 'body']);
    expect(JSON.stringify(result.normalizedValues)).not.toMatch(/desconocido@example|sin información|no disponible|1970/u);
  });

  it('blocks ambiguous text dates and multi-value email cells, preserving raw values with warnings', () => {
    const date = normalizeImportRow(DataImportRecordKind.HISTORICAL_RECORD, row(4, ['X', '20/05/2024', null, '']), headers,
      { occurredOn: 2, organizationName: 1 });
    expect(date.status).toBe('INVALID');
    expect(date.sourceValues.Fecha).toBe('20/05/2024');
    expect(date.warnings.some(item => item.field === 'occurredOn' && item.message.includes('ambigua'))).toBe(true);
    const email = normalizeImportRow(DataImportRecordKind.HISTORICAL_RECORD, row(5, ['X', null, 'persona@example.org; otro@example.org', '']), headers,
      { email: 3, organizationName: 1 });
    expect(email.status).toBe('INVALID');
    expect(email.sourceValues.Correo).toBe('persona@example.org; otro@example.org');
    expect(email.warnings.some(item => item.field === 'email' && item.message.includes('varios valores'))).toBe(true);
  });

  it('rejects incomplete ordinary records and formulas in mapped cells', () => {
    expect(normalizeImportRow(DataImportRecordKind.PERSON, row(5, [null, null, null, null]), headers, {}).status).toBe('INVALID');
    expect(normalizeImportRow(DataImportRecordKind.ORGANIZATION, row(6, ['=1+1', null, null, null], 'FORMULA'), headers,
      { name: 1 }).errors[0].message).toMatch(/fórmulas no se ejecutan/u);
  });

  it('allows an organization without optional country and preserves that field as null', () => {
    const result = normalizeImportRow(DataImportRecordKind.ORGANIZATION, row(2, ['Fundación Ejemplo', null, null, null]), headers, { name: 1 });
    expect(result.status).toBe('READY');
    expect(result.normalizedValues).toMatchObject({ name: 'Fundación Ejemplo', country: null });
  });

  it('preserves raw values from duplicate column headings without overwriting either value', () => {
    const duplicateHeaders = [{ column: 1, value: 'Nota', cellType: 'TEXT' as const }, { column: 2, value: 'Nota', cellType: 'TEXT' as const }];
    const result = normalizeImportRow(DataImportRecordKind.ORGANIZATION, row(2, ['Fundación Ejemplo', 'Texto original']), duplicateHeaders, { name: 1 });
    expect(result.sourceValues).toEqual({ 'Nota (columna 1)': 'Fundación Ejemplo', 'Nota (columna 2)': 'Texto original' });
  });
});
