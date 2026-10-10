import { z } from 'zod';
export const consolidationOriginSchema = z.object({ source: z.object({ id:z.string(),path:z.string(),label:z.string() }),
  outcome:z.enum(['CREATED','REUSED','KEPT_PRINCIPAL']),sourceVersion:z.number(),targetVersion:z.number(),resolvedAt:z.string().nullable(),
  resolvedBy:z.object({id:z.string(),givenNames:z.string(),familyNames:z.string(),isActive:z.boolean()}).nullable() });
export const categorySchema = z.object({ id: z.string(), name: z.string(), isActive: z.boolean(), version: z.number().int().positive(), createdAt: z.string(), updatedAt: z.string() });
export const importProvenanceSchema = z.object({ id: z.string(), originalFilename: z.string(), createdAt: z.string() }).nullable();
export const organizationSchema = z.object({ duplicateOfId:z.string().nullable().optional(),duplicateOf:z.object({id:z.string(),name:z.string()}).nullable().optional(),consolidatedRecords:z.array(z.object({id:z.string(),name:z.string()})).optional(), id: z.string(), name: z.string(), country: z.string().nullable(), alias: z.string().nullable(),
  description: z.string().nullable(), officialWebsite: z.string().nullable(), isActive: z.boolean(), version: z.number().int().positive(),
  parentId: z.string().nullable(), parent: z.object({ id: z.string(), name: z.string(), isActive: z.boolean() }).nullable(),
  categories: z.array(categorySchema), createdAt: z.string(), updatedAt: z.string(), lastVerifiedAt: z.string().nullable(), dataImportBatchId:z.string().uuid().nullable().optional(), dataImportBatch:importProvenanceSchema.optional() });
export const historyReferenceSchema = z.object({id:z.string(),kind:z.enum(['organization','category','person','contactMethod']),label:z.string().nullable()});
const historyValueSchema=z.union([z.string(),z.boolean(),z.array(z.string()),z.null()]);
export const historyChangeSchema=z.object({field:z.string(),label:z.string(),previousValue:historyValueSchema,newValue:historyValueSchema,
  previousReferences:z.array(historyReferenceSchema),newReferences:z.array(historyReferenceSchema),added:z.array(historyReferenceSchema),removed:z.array(historyReferenceSchema)});
export const historySchema=z.object({operationId:z.string(),createdAt:z.string(),objectType:z.enum(['ORGANIZATION','CATEGORY','PERSON','PERSON_ORGANIZATION_RELATION','CONTACT_METHOD','PERSON_CONTACT','ORGANIZATION_CONTACT']),
  actor:z.object({id:z.string(),givenNames:z.string(),familyNames:z.string(),isActive:z.boolean()}),contextRecorded:z.boolean(),relatedReferences:z.array(historyReferenceSchema),
  replacement:z.object({previous:historyReferenceSchema,next:historyReferenceSchema}).nullable(),changes:z.array(historyChangeSchema)});
export const pageSchema = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive() });
export const historyPageSchema = pageSchema(historySchema);
export type Organization = z.infer<typeof organizationSchema>;
export type Category = z.infer<typeof categorySchema>;
export type HistoryOperation = z.infer<typeof historySchema>;
export type HistoryChange = z.infer<typeof historyChangeSchema>;
export type HistoryReference = z.infer<typeof historyReferenceSchema>;
const text = (max: number) => z.string().trim().transform(value => value.replace(/\s+/gu, ' ')).pipe(z.string().max(max, `El máximo es ${max} caracteres.`));
export const organizationFormSchema = z.object({
  name: text(250).pipe(z.string().min(1, 'El nombre es obligatorio.')), country: text(150), alias: text(150), description: text(5000),
  officialWebsite: text(2048).refine(value => {
    if (!value) return true;
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password; } catch { return false; }
  }, 'Introduce un sitio http o https válido.'), parentId: z.string(), categoryIds: z.array(z.string()).max(100),
});
export type OrganizationFormValues = z.infer<typeof organizationFormSchema>;
export const categoryFormSchema = z.object({ name: text(150).pipe(z.string().min(1, 'El nombre es obligatorio.')) });

export const personInstitutionalStatusSchema = z.enum(['NO_KNOWN_LINKS','HISTORICAL_ONLY','CURRENT']);
export const personSchema = z.object({ duplicateOfId:z.string().nullable().optional(),duplicateOf:z.object({id:z.string(),displayName:z.string()}).nullable().optional(),consolidatedRecords:z.array(z.object({id:z.string(),displayName:z.string()})).optional(), id:z.string(),displayName:z.string(),givenNames:z.string().nullable(),familyNames:z.string().nullable(),
  isActive:z.boolean(),version:z.number().int().positive(),createdAt:z.string(),updatedAt:z.string(),lastVerifiedAt:z.string().nullable(),dataImportBatchId:z.string().uuid().nullable().optional(),dataImportBatch:importProvenanceSchema.optional(),currentRelationsCount:z.number().int().nonnegative(),institutionalStatus:personInstitutionalStatusSchema.optional() });
export const relationSchema = z.object({ consolidationOrigins:z.array(consolidationOriginSchema).optional(),id:z.string(),personId:z.string(),organizationId:z.string(),positionTitle:z.string().nullable(),area:z.string().nullable(),
  isCurrent:z.boolean(),startDate:z.string().nullable(),endDate:z.string().nullable(),sourceDescription:z.string().nullable(),sourceUrl:z.string().nullable(),notes:z.string().nullable(),
  version:z.number().int().positive(),createdAt:z.string(),updatedAt:z.string(),person:z.object({id:z.string(),displayName:z.string(),isActive:z.boolean(),duplicateOfId:z.string().nullable().optional()}),
  organization:z.object({id:z.string(),name:z.string(),isActive:z.boolean(),duplicateOfId:z.string().nullable().optional()}) });
export const organizationPersonContextResponseSchema = z.object({person:personSchema.extend({institutionalStatus:personInstitutionalStatusSchema}),relation:relationSchema});
export type Person = z.infer<typeof personSchema>;
export type PersonRelation = z.infer<typeof relationSchema>;
export type OrganizationPersonContextResult = z.infer<typeof organizationPersonContextResponseSchema>;
export const personFormSchema = z.object({ displayName:text(250).pipe(z.string().min(1,'El nombre de presentación es obligatorio.')),givenNames:text(150),familyNames:text(150) });
export type PersonFormValues = z.infer<typeof personFormSchema>;
const calendarDate = z.string().refine(value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '0001-01-01' &&
  Number.isFinite(+new Date(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value),'Introduce una fecha completa válida o déjala vacía.');
const episodeFields = {positionTitle:text(250),area:text(250),isCurrent:z.boolean(),startDate:calendarDate,endDate:calendarDate,
  sourceDescription:text(1000),sourceUrl:organizationFormSchema.shape.officialWebsite,notes:text(5000)};
type EpisodeDateValues = {isCurrent:boolean;startDate:string;endDate:string};
function validateEpisodeDates(value:EpisodeDateValues,context:z.RefinementCtx) {
  if(value.startDate&&value.endDate&&value.startDate>value.endDate) context.addIssue({code:'custom',message:'El fin no puede ser anterior al inicio.',path:['endDate']});
  if(value.isCurrent&&value.endDate) context.addIssue({code:'custom',message:'Un vínculo vigente no tiene fecha final.',path:['endDate']});
}
export const relationFormSchema = z.object({organizationId:z.string().min(1,'Selecciona una organización.'),...episodeFields}).superRefine(validateEpisodeDates);
const contextualEpisodeFields = z.object(episodeFields);
export const organizationPersonContextFormSchema = contextualEpisodeFields.extend({
  personMode:z.enum(['new','existing']),person:z.object({displayName:z.string(),givenNames:z.string(),familyNames:z.string()}).optional(),personId:z.string().optional()
}).superRefine((value,context)=>{
  validateEpisodeDates(value,context);
  if(value.personMode==='new') {
    const person=personFormSchema.safeParse(value.person);
    if(!person.success) for(const issue of person.error.issues) context.addIssue({...issue,path:['person',...issue.path]});
  } else if(!value.personId?.trim()) context.addIssue({code:'custom',message:'Selecciona una persona.',path:['personId']});
});
export type RelationFormValues = z.infer<typeof relationFormSchema>;
export type OrganizationPersonContextFormValues = z.infer<typeof organizationPersonContextFormSchema>;
export const relationEndFormSchema = z.object({endDate:calendarDate,confirmed:z.boolean().refine(value=>value,'Confirma la finalización para continuar.')});
