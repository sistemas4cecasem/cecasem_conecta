import { z } from 'zod';
import { optionalContactMethodsSchema } from './contacts.contracts';

const text = (maximum:number) => z.string().trim().transform(value=>value.replace(/\s+/gu,' ')).pipe(z.string().max(maximum,`El máximo es ${maximum} caracteres.`));
const personFieldsSchema = z.object({givenNames:text(150),familyNames:text(150)}).superRefine((person,context)=>{
  if(!person.givenNames&&!person.familyNames) context.addIssue({code:'custom',message:'Ingresa nombres o apellidos.',path:['givenNames']});
  if([person.givenNames,person.familyNames].filter(Boolean).join(' ').length>250) context.addIssue({code:'custom',message:'Los nombres y apellidos no pueden superar 250 caracteres en total.',path:['familyNames']});
});
export const organizationPersonContextFormSchema = z.object({
  person:personFieldsSchema,
  contactMethods:optionalContactMethodsSchema,
  positionTitle:text(250),area:text(250),notes:text(5000),
});
export type OrganizationPersonContextFormValues = z.infer<typeof organizationPersonContextFormSchema>;
