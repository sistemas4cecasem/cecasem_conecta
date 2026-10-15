import { z } from 'zod';
import { organizationSchema, organizationFormSchema } from './contracts';
import { contactAssociationSchema, contactCreateFormSchema } from './contacts.contracts';
export const branchProfileSchema=z.object({branch:organizationSchema,contacts:z.array(contactAssociationSchema)});
export type BranchProfile=z.infer<typeof branchProfileSchema>;
export const branchProfileFormSchema=z.object({
  country:z.string().trim().min(1,'Indica el lugar de la sede.').max(150),
  alias:organizationFormSchema.shape.alias,description:organizationFormSchema.shape.description,officialWebsite:organizationFormSchema.shape.officialWebsite,
  contacts:z.array(contactCreateFormSchema.safeExtend({associationId:z.string()})).max(100),
});
export type BranchProfileFormValues=z.infer<typeof branchProfileFormSchema>;
export function branchProfileValues(profile:BranchProfile):BranchProfileFormValues {
  return {country:profile.branch.country??'',alias:profile.branch.alias??'',description:profile.branch.description??'',officialWebsite:profile.branch.officialWebsite??'',
    contacts:profile.contacts.map(row=>({associationId:row.id,type:row.contactMethod.type,value:row.contactMethod.value,label:row.contactMethod.label??'',sourceDescription:row.sourceDescription??'',sourceUrl:row.sourceUrl??'',notes:row.notes??''}))};
}
