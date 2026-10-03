import type { Prisma } from '../../generated/prisma/client';

const resolution = { resolvedAt: true, resolvedBy: { select: { id: true, givenNames: true, familyNames: true, isActive: true } } } as const;
export const personContactOrigins = { select: { outcome: true, sourceVersion: true, targetVersion: true, candidate: { select: resolution },
  sourcePersonContact: { select: { id: true, personId: true, person: { select: { displayName: true } } } } } } satisfies Prisma.PersonContactSelect['reconciliationTargets'];
export const organizationContactOrigins = { select: { outcome: true, sourceVersion: true, targetVersion: true, candidate: { select: resolution },
  sourceOrganizationContact: { select: { id: true, organizationId: true, organization: { select: { name: true } } } } } } satisfies Prisma.OrganizationContactSelect['reconciliationTargets'];
export const relationOrigins = { select: { outcome: true, sourceVersion: true, targetVersion: true, candidate: { select: resolution },
  sourceRelation: { select: { id: true, personId: true, organizationId: true, person: { select: { displayName: true } }, organization: { select: { name: true } } } } } } satisfies Prisma.PersonOrganizationRelationSelect['reconciliationTargets'];
interface Resolution { resolvedAt: Date | null; resolvedBy: { id: string; givenNames: string; familyNames: string; isActive: boolean } | null }
interface Origin { outcome: string; sourceVersion: number; targetVersion: number; candidate: Resolution;
  sourcePersonContact?: { id: string; personId: string; person: { displayName: string } } | null;
  sourceOrganizationContact?: { id: string; organizationId: string; organization: { name: string } } | null;
  sourceRelation?: { id: string; personId: string; organizationId: string; person: { displayName: string }; organization: { name: string } } | null }
export function provenanceContract(origins: readonly Origin[]) {
  return origins.map(row => {
    const source = row.sourcePersonContact ? { id: row.sourcePersonContact.id, path: 'people/' + row.sourcePersonContact.personId, label: row.sourcePersonContact.person.displayName }
      : row.sourceOrganizationContact ? { id: row.sourceOrganizationContact.id, path: 'organizations/' + row.sourceOrganizationContact.organizationId, label: row.sourceOrganizationContact.organization.name }
      : row.sourceRelation ? { id: row.sourceRelation.id, path: 'people/' + row.sourceRelation.personId,
        label: row.sourceRelation.person.displayName + ' / ' + row.sourceRelation.organization.name } : null;
    if (!source) throw new Error('Reconciliación sin referencia original.');
    return { source, outcome: row.outcome, sourceVersion: row.sourceVersion, targetVersion: row.targetVersion,
      resolvedAt: row.candidate.resolvedAt, resolvedBy: row.candidate.resolvedBy };
  });
}
