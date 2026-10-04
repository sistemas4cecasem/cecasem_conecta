import { Injectable } from '@nestjs/common';
import { Prisma, type ContactType } from '../../generated/prisma/client';
import { DirectoryActorPolicy } from './directory-actor.policy';
import { contactFields } from './contacts.rules';
export class UnavailableReferralReference extends Error {}
export interface ReferralReferences { personId: string | null; organizationId: string | null; contactMethodId: string | null }
/** Referencias históricas: admite fichas inactivas y personas con vínculo institucional. */
@Injectable()
export class DirectoryReferralsService {
  constructor(private readonly actors: DirectoryActorPolicy) {}
  async requireReferences(refs: ReferralReferences & { mediumType: ContactType | null; mediumValue: string | null }, tx: Prisma.TransactionClient) {
    await this.actors.lock(tx);
    if (refs.organizationId) {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${refs.organizationId}::uuid FOR SHARE`;
      const row = await tx.organization.findUnique({ where: { id: refs.organizationId }, select: { duplicateOfId: true } });
      if (!row || row.duplicateOfId) throw new UnavailableReferralReference();
    }
    if (refs.personId) {
      await tx.$queryRaw`SELECT id FROM "Person" WHERE id=${refs.personId}::uuid FOR SHARE`;
      const row = await tx.person.findUnique({ where: { id: refs.personId }, select: { duplicateOfId: true } });
      if (!row || row.duplicateOfId) throw new UnavailableReferralReference();
    }
    if (refs.contactMethodId) {
      await tx.$queryRaw`SELECT id FROM "ContactMethod" WHERE id=${refs.contactMethodId}::uuid FOR SHARE`;
      const row = await tx.contactMethod.findUnique({ where: { id: refs.contactMethodId }, select: { type: true, value: true, condition: true } });
      if (!row || row.condition !== 'USABLE' || row.type !== refs.mediumType || !refs.mediumValue) throw new UnavailableReferralReference();
      const normalized = contactFields({ type: row.type, value: refs.mediumValue, label: row.type === 'OTHER' ? refs.mediumValue.slice(0, 150) : null }).value;
      if (row.value !== normalized) throw new UnavailableReferralReference();
      if (refs.personId) {
        await tx.$queryRaw`SELECT id FROM "PersonContact" WHERE "personId"=${refs.personId}::uuid AND "contactMethodId"=${refs.contactMethodId}::uuid FOR SHARE`;
        if (!await tx.personContact.count({ where: { personId: refs.personId, contactMethodId: refs.contactMethodId, isActive: true } })) throw new UnavailableReferralReference();
      }
      if (refs.organizationId && !refs.personId) {
        await tx.$queryRaw`SELECT id FROM "OrganizationContact" WHERE "organizationId"=${refs.organizationId}::uuid AND "contactMethodId"=${refs.contactMethodId}::uuid FOR SHARE`;
        if (!await tx.organizationContact.count({ where: { organizationId: refs.organizationId, contactMethodId: refs.contactMethodId, isActive: true } })) throw new UnavailableReferralReference();
      }
    }
  }
  async describeReferences(refs: readonly ReferralReferences[], tx: Prisma.TransactionClient) {
    const ids = (field: keyof ReferralReferences) => [...new Set(refs.flatMap(ref => ref[field] ? [ref[field]] : []))];
    const personIds = ids('personId'), organizationIds = ids('organizationId'), contactIds = ids('contactMethodId');
    const people = personIds.length ? await tx.person.findMany({ where: { id: { in: personIds } }, select: { id: true, displayName: true, isActive: true, duplicateOfId: true } }) : [];
    const organizations = organizationIds.length ? await tx.organization.findMany({ where: { id: { in: organizationIds } }, select: { id: true, name: true, isActive: true, duplicateOfId: true } }) : [];
    const contacts = contactIds.length ? await tx.contactMethod.findMany({ where: { id: { in: contactIds } }, select: { id: true, type: true, value: true, condition: true } }) : [];
    return { people: new Map(people.map(row => [row.id, { id: row.id, label: row.displayName, isActive: row.isActive, currentId: row.duplicateOfId ?? row.id }])),
      organizations: new Map(organizations.map(row => [row.id, { id: row.id, label: row.name, isActive: row.isActive, currentId: row.duplicateOfId ?? row.id }])), contacts: new Map(contacts.map(row => [row.id, row])) };
  }
}
