import { z } from 'zod';
import { contactCreateFormSchema, contactTypes } from './contacts.contracts';

const text = (maximum:number) => z.string().trim().transform(value=>value.replace(/\s+/gu,' ')).pipe(z.string().max(maximum,`El máximo es ${maximum} caracteres.`));
const personFieldsSchema = z.object({givenNames:text(150),familyNames:text(150)}).superRefine((person,context)=>{
  if(!person.givenNames&&!person.familyNames) context.addIssue({code:'custom',message:'Ingresa nombres o apellidos.',path:['givenNames']});
  if([person.givenNames,person.familyNames].filter(Boolean).join(' ').length>250) context.addIssue({code:'custom',message:'Los nombres y apellidos no pueden superar 250 caracteres en total.',path:['familyNames']});
});
const contactMethodFieldsSchema = z.object({type:z.enum(contactTypes),value:z.string(),label:z.string()});
const contactMethodsSchema = z.array(contactMethodFieldsSchema).superRefine((methods,context)=>{
  methods.forEach((method,index)=>{
    if(!method.value.trim())return;
    const parsed=contactCreateFormSchema.safeParse({...method,sourceDescription:'',sourceUrl:'',notes:''});
    if(!parsed.success) for(const issue of parsed.error.issues) context.addIssue({...issue,path:[index,...issue.path]});
  });
});
export const organizationPersonContextFormSchema = z.object({
  person:personFieldsSchema,
  contactMethods:contactMethodsSchema,
  positionTitle:text(250),area:text(250),isCurrent:z.boolean(),notes:text(5000),
});
export type OrganizationPersonContextFormValues = z.infer<typeof organizationPersonContextFormSchema>;
