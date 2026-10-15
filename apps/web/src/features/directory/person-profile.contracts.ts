import { z } from 'zod';
import { personSchema, personFormSchema, relationSchema } from './contracts';
import { contactAssociationSchema, contactCreateFormSchema } from './contacts.contracts';

export const personProfileSchema = z.object({ person: personSchema, contacts: z.array(contactAssociationSchema), relations: z.array(relationSchema) });
export type PersonProfile = z.infer<typeof personProfileSchema>;
const contactInput = contactCreateFormSchema.safeExtend({ associationId: z.string() });
export const personProfileFormSchema = personFormSchema.extend({
  contacts: z.array(contactInput),
  relations: z.array(z.object({ id:z.string(), expectedVersion:z.number(), organizationName:z.string(), isCurrent:z.boolean(),
    positionTitle:z.string().trim().max(250), area:z.string().trim().max(250) })),
});
export type PersonProfileFormValues = z.infer<typeof personProfileFormSchema>;
export function profileFormValues(profile: PersonProfile): PersonProfileFormValues {
  return { displayName:profile.person.displayName,givenNames:profile.person.givenNames??'',familyNames:profile.person.familyNames??'',
    contacts:profile.contacts.map(row=>({associationId:row.id,type:row.contactMethod.type,value:row.contactMethod.value,label:row.contactMethod.label??'',sourceDescription:'',sourceUrl:'',notes:''})),
    relations:profile.relations.map(row=>({id:row.id,expectedVersion:row.version,organizationName:row.organization.name,isCurrent:row.isCurrent,positionTitle:row.positionTitle??'',area:row.area??''})) };
}
