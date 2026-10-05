import { z } from 'zod';
const base = { id:z.string().uuid(), createdAt:z.string().datetime(), readAt:z.string().datetime().nullable(), reminder:z.null().optional(), process:z.null().optional() };
const reminder = z.object({ id:z.string().uuid(), intentId:z.string().uuid().nullable(), processId:z.string().uuid().nullable(),
  purpose:z.string(), context:z.string(), inactivityAnchorAt:z.string().datetime(), dueAt:z.string().datetime(), intervalDays:z.number().int().positive() });
const opportunity = z.object({id:z.string().uuid(),name:z.string(),status:z.enum(['PENDING_REVIEW','PREPARING','SUBMITTED','DISCARDED','FINISHED'])});
const meeting = z.object({id:z.string().uuid(),scheduledAt:z.string().datetime(),timezone:z.string(),purpose:z.string(),processId:z.string().uuid().nullable(),opportunityId:z.string().uuid().nullable()});
export const notificationSchema = z.discriminatedUnion('type', [
  z.object({...base,type:z.literal('PROCESS_ACHIEVED'),opportunity:z.null(),meeting:z.null(),process:z.object({id:z.string().uuid(),purpose:z.string(),context:z.string(),occurredAt:z.string().datetime()})}),
  z.object({...base,type:z.literal('INTENT_INACTIVITY_REMINDER'),opportunity:z.null(),meeting:z.null(),reminder:reminder.extend({intentId:z.string().uuid(),processId:z.null()})}),
  z.object({...base,type:z.literal('PROCESS_INACTIVITY_REMINDER'),opportunity:z.null(),meeting:z.null(),reminder:reminder.extend({intentId:z.null(),processId:z.string().uuid()})}),
  z.object({...base,type:z.enum(['OPPORTUNITY_CREATED','OPPORTUNITY_DISCARDED','OPPORTUNITY_FINISHED']),opportunity,meeting:z.null().optional()}),
  z.object({...base,type:z.enum(['MEETING_CREATED','MEETING_CANCELLED','MEETING_COMPLETED','MEETING_PARTICIPANT_ADDED','MEETING_RESCHEDULED']),opportunity:z.null(),meeting}),
]);
export const notificationPageSchema = z.object({ items: z.array(notificationSchema), nextCursor: z.string().nullable() });
export const notificationCountSchema = z.object({ count: z.number().int().nonnegative() });
export type Notification = z.infer<typeof notificationSchema>;
