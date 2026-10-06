import { Prisma } from '../../generated/prisma/client';

const combiningMarks = Array.from({ length: 112 }, (_, index) => String.fromCharCode(0x300 + index)).join('');

/** Misma normalización de nombres/propositos que la búsqueda inicial del Directorio. */
export function normalizedSearchText(column: Prisma.Sql) {
  return Prisma.sql`btrim(regexp_replace(translate(lower(normalize(coalesce(${column}, ''), NFD)), ${combiningMarks}, ''), '[^[:alnum:]]+', ' ', 'g'))`;
}
