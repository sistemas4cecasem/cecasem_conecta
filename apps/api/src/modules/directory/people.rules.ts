import { institutionalText, website } from './directory.rules';
import { DirectoryError } from './directory.errors';
import type { PersonInputDto, RelationFieldsDto } from './people.dto';
export function calendarDate(value?: string | null): Date | null {
  if (value == null || value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') throw new DirectoryError('INVALID_DIRECTORY');
  const result = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(+result) || result.toISOString().slice(0,10) !== value) throw new DirectoryError('INVALID_DIRECTORY');
  return result;
}
export function personFields(input: PersonInputDto) {
  return { displayName: institutionalText(input.displayName,250,true)!, givenNames: institutionalText(input.givenNames,150), familyNames: institutionalText(input.familyNames,150) };
}
export function relationFields(input: RelationFieldsDto) {
  const startDate = calendarDate(input.startDate), endDate = calendarDate(input.endDate);
  if (typeof input.isCurrent !== 'boolean' || (startDate && endDate && startDate > endDate) || (input.isCurrent && endDate)) throw new DirectoryError('INVALID_DIRECTORY');
  return { positionTitle: institutionalText(input.positionTitle,250), area: institutionalText(input.area,250), isCurrent:input.isCurrent,
    startDate, endDate, sourceDescription:institutionalText(input.sourceDescription,1000), sourceUrl:website(input.sourceUrl), notes:institutionalText(input.notes,5000) };
}
