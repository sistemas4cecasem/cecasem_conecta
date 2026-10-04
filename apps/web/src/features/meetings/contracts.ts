import { z } from 'zod';
export const MEETING_STATUS_LABELS={SCHEDULED:'Programada',COMPLETED:'Realizada',CANCELLED:'Cancelada'};
export const MODALITY_LABELS={ONLINE:'En línea',IN_PERSON:'Presencial',HYBRID:'Híbrida'};
export const ATTENDANCE_LABELS={UNKNOWN:'Sin registrar',ATTENDED:'Asistió',ABSENT:'No asistió'};
export const MEETING_EVENT_LABELS={CREATED:'REUNIÓN PROGRAMADA',UPDATED:'Planificación actualizada',COMPLETED:'REUNIÓN REALIZADA',CANCELLED:'REUNIÓN CANCELADA',PARTICIPANT_ADDED:'Participante incorporado',ATTENDANCE_RECORDED:'Asistencia registrada',AGREEMENT_ADDED:'Acuerdo registrado'};
export const meetingUserSchema=z.object({id:z.uuid(),displayName:z.string(),isActive:z.boolean()});
export const meetingSnapshotSchema=z.object({purpose:z.string(),scheduledAt:z.iso.datetime(),timezone:z.string(),modality:z.enum(['ONLINE','IN_PERSON','HYBRID']),meetingUrl:z.string().nullable(),location:z.string().nullable(),participantCount:z.number().int(),opportunity:z.object({id:z.uuid(),name:z.string()}).nullable()});
export const meetingSchema=z.object({id:z.uuid(),processId:z.uuid().nullable(),opportunityId:z.uuid().nullable(),scheduledAt:z.iso.datetime(),scheduledLocal:z.string(),timezone:z.string(),
 modality:z.enum(['ONLINE','IN_PERSON','HYBRID']),meetingUrl:z.string().nullable(),location:z.string().nullable(),purpose:z.string(),status:z.enum(['SCHEDULED','COMPLETED','CANCELLED']),
 completedAt:z.iso.datetime().nullable(),cancelledAt:z.iso.datetime().nullable(),cancellationReason:z.string().nullable(),version:z.number().int().positive(),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime(),createdBy:meetingUserSchema,
 process:z.object({id:z.uuid(),purpose:z.string()}).nullable(),opportunity:z.object({id:z.uuid(),name:z.string()}).nullable(),participantCount:z.number().int(),agreementCount:z.number().int(),canEdit:z.boolean(),canComplete:z.boolean()});
export const participantSchema=z.object({id:z.uuid(),meetingId:z.uuid(),userId:z.uuid().nullable(),personId:z.uuid().nullable(),nameSnapshot:z.string(),organizationSnapshot:z.string().nullable(),roleSnapshot:z.string().nullable(),attendance:z.enum(['UNKNOWN','ATTENDED','ABSENT']),createdAt:z.iso.datetime(),createdBy:meetingUserSchema});
export const agreementSchema=z.object({id:z.uuid(),meetingId:z.uuid(),text:z.string(),createdAt:z.iso.datetime(),createdBy:meetingUserSchema});
export const meetingEventSchema=z.object({id:z.uuid(),meetingId:z.uuid(),type:z.enum(['CREATED','UPDATED','COMPLETED','CANCELLED','PARTICIPANT_ADDED','ATTENDANCE_RECORDED','AGREEMENT_ADDED']),version:z.number().int(),snapshot:meetingSnapshotSchema,changes:z.record(z.string(),z.unknown()),createdAt:z.iso.datetime(),actor:meetingUserSchema});
export function pageSchema<T extends z.ZodType>(schema:T){return z.object({items:z.array(schema),total:z.number().int(),page:z.number().int(),pageSize:z.number().int()});}
export const meetingsPageSchema=pageSchema(meetingSchema);
export const participantsPageSchema=pageSchema(participantSchema);
export const agreementsPageSchema=pageSchema(agreementSchema);
export const meetingEventsPageSchema=pageSchema(meetingEventSchema);
const optionalText=(max:number)=>z.string().max(max).refine(value=>!value.includes('\0'),'El texto contiene un carácter inválido.');
export const planningFormSchema=z.object({scheduledLocal:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,'Indica fecha y hora local.'),timezone:z.string().trim().min(1,'Indica la zona horaria.').max(100),
 disambiguation:z.enum(['','earlier','later']),modality:z.enum(['ONLINE','IN_PERSON','HYBRID']),meetingUrl:optionalText(2048),location:optionalText(500),purpose:optionalText(5000).refine(value=>!!value.trim(),'Indica el propósito.')})
 .superRefine((values,ctx)=>{if(values.modality==='ONLINE'&&values.location.trim())ctx.addIssue({code:'custom',path:['location'],message:'En línea no admite un lugar presencial.'});if(values.modality==='IN_PERSON'&&values.meetingUrl.trim())ctx.addIssue({code:'custom',path:['meetingUrl'],message:'Presencial no admite un enlace de reunión.'});if(values.meetingUrl){try{const url=new URL(values.meetingUrl);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error();}catch{ctx.addIssue({code:'custom',path:['meetingUrl'],message:'Indica un enlace HTTP o HTTPS válido.'});}}});
export type PlanningForm=z.infer<typeof planningFormSchema>;
export const planningBody=(values:PlanningForm)=>({...values,disambiguation:values.disambiguation||undefined,meetingUrl:values.meetingUrl.trim()||null,location:values.location.trim()||null});
export type Meeting=z.infer<typeof meetingSchema>;
export type MeetingParticipant=z.infer<typeof participantSchema>;
export type MeetingEvent=z.infer<typeof meetingEventSchema>;
export function meetingDate(instant:string,timezone:string){return new Intl.DateTimeFormat('es-BO',{timeZone:timezone,dateStyle:'short',timeStyle:'short',hourCycle:'h23'}).format(new Date(instant))+' · '+timezone;}
