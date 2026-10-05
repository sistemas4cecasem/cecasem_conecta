import { z } from 'zod';
const base = { id:z.string().uuid(), createdAt:z.string().datetime(), readAt:z.string().datetime().nullable() };
const opportunity = z.object({id:z.string().uuid(),name:z.string(),status:z.enum(['PENDING_REVIEW','PREPARING','SUBMITTED','DISCARDED','FINISHED'])});
const meeting = z.object({id:z.string().uuid(),scheduledAt:z.string().datetime(),timezone:z.string(),purpose:z.string(),processId:z.string().uuid().nullable(),opportunityId:z.string().uuid().nullable()});
export const notificationSchema = z.discriminatedUnion('type', [
  z.object({...base,type:z.enum(['OPPORTUNITY_CREATED','OPPORTUNITY_DISCARDED','OPPORTUNITY_FINISHED']),opportunity,meeting:z.null().optional()}),
  z.object({...base,type:z.enum(['MEETING_CREATED','MEETING_CANCELLED','MEETING_COMPLETED','MEETING_PARTICIPANT_ADDED','MEETING_RESCHEDULED']),opportunity:z.null(),meeting}),
]);
export const notificationPageSchema = z.object({ items: z.array(notificationSchema), nextCursor: z.string().nullable() });
export const notificationCountSchema = z.object({ count: z.number().int().nonnegative() });
export type Notification = z.infer<typeof notificationSchema>;
