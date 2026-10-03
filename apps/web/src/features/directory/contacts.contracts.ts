import { z } from 'zod';
import { consolidationOriginSchema, organizationFormSchema } from './contracts';
export const contactTypes = ['EMAIL','PHONE','LINKEDIN','FORM','WEB','OTHER'] as const;
export const contactLabels: Record<typeof contactTypes[number],string> = {EMAIL:'Correo',PHONE:'Teléfono',LINKEDIN:'LinkedIn',FORM:'Formulario',WEB:'Web',OTHER:'Otro'};
export const conditionLabels = {USABLE:'Disponible',UNUSABLE:'No utilizable (reportado)'};
export const contactMethodSchema = z.object({id:z.string(),type:z.enum(contactTypes),value:z.string(),label:z.string().nullable(),condition:z.enum(['USABLE','UNUSABLE']),
  version:z.number().int().positive(),createdAt:z.string(),updatedAt:z.string(),associationCount:z.number().int().nonnegative()});
const associationFields={consolidationOrigins:z.array(consolidationOriginSchema).optional(),id:z.string(),contactMethodId:z.string(),sourceDescription:z.string().nullable(),sourceUrl:z.string().nullable(),notes:z.string().nullable(),
  isActive:z.boolean(),version:z.number().int().positive(),createdAt:z.string(),updatedAt:z.string(),lastVerifiedAt:z.string().nullable(),contactMethod:contactMethodSchema};
export const contactAssociationSchema=z.union([
  z.object({...associationFields,personId:z.string(),person:z.object({id:z.string(),displayName:z.string(),isActive:z.boolean(),duplicateOfId:z.string().nullable().optional()})}),
  z.object({...associationFields,organizationId:z.string(),organization:z.object({id:z.string(),name:z.string(),isActive:z.boolean(),duplicateOfId:z.string().nullable().optional()})}),
]);
export type ContactMethod=z.infer<typeof contactMethodSchema>;
export type ContactAssociation=z.infer<typeof contactAssociationSchema>;
const optionalText=(maximum:number)=>z.string().trim().max(maximum,'El texto es demasiado largo.');
export const contactContextSchema=z.object({sourceDescription:optionalText(1000),sourceUrl:organizationFormSchema.shape.officialWebsite,notes:optionalText(5000)});
export type ContactContextValues=z.infer<typeof contactContextSchema>;
const contactValueShape={type:z.enum(contactTypes),value:z.string().trim().min(1,'El valor es obligatorio.').max(2048,'El valor es demasiado largo.'),label:optionalText(150)};
function validateContact(input:{type:typeof contactTypes[number];value:string;label:string},ctx:z.RefinementCtx) {
  let valid=true;
  if(input.type==='EMAIL') valid=z.email().safeParse(input.value).success && input.value.length<=254;
  else if(input.type==='PHONE') valid=/^\+?[\d ().-]+$/.test(input.value) && input.value.replace(/\D/g,'').length>=6 && input.value.replace(/\D/g,'').length<=20;
  else if(['WEB','FORM','LINKEDIN'].includes(input.type)) {
    valid=organizationFormSchema.shape.officialWebsite.safeParse(input.value).success;
    if(valid && input.type==='LINKEDIN') {try{const host=new URL(input.value).hostname.toLowerCase();valid=host==='linkedin.com'||host.endsWith('.linkedin.com');}catch{valid=false;}}
  }
  if(!valid)ctx.addIssue({code:'custom',path:['value'],message:'Introduce un medio válido para el tipo seleccionado.'});
  if(input.type==='OTHER'&&!input.label.trim())ctx.addIssue({code:'custom',path:['label'],message:'Describe qué canal representa este medio.'});
}
export const contactCreateFormSchema=z.object({...contactValueShape,...contactContextSchema.shape}).superRefine(validateContact);
export type ContactCreateValues=z.infer<typeof contactCreateFormSchema>;
export const contactCorrectionSchema=z.object({...contactValueShape,confirmShared:z.boolean()}).superRefine(validateContact);
export type ContactCorrectionValues=z.infer<typeof contactCorrectionSchema>;
export const contactReplacementSchema=contactContextSchema.extend({confirmed:z.boolean().refine(value=>value,'Confirma la sustitución para continuar.')});
export const contactAssociationResultSchema=z.object({outcome:z.enum(['created','existing']),association:contactAssociationSchema});
