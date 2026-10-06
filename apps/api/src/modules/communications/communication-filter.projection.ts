import { Prisma } from '../../generated/prisma/client';

/** Proyección pública de antecedentes externos del actor principal, incluidas invalidaciones. */
export function organizationCommunicationExists(id: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXISTS (SELECT 1 FROM "RelationshipProcess" p WHERE p."organizationId" = ${id}
    AND EXISTS (SELECT 1 FROM "Communication" c WHERE c."processId" = p.id))`;
}
