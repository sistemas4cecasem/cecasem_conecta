import { z } from 'zod';

export const notificationSchema = z.object({
  id: z.string().uuid(), type: z.literal('OPPORTUNITY_CREATED'), createdAt: z.string().datetime(),
  readAt: z.string().datetime().nullable(),
  opportunity: z.object({ id: z.string().uuid(), name: z.string(),
    status: z.enum(['PENDING_REVIEW', 'PREPARING', 'SUBMITTED', 'DISCARDED', 'FINISHED']) }),
});
export const notificationPageSchema = z.object({ items: z.array(notificationSchema), nextCursor: z.string().nullable() });
export const notificationCountSchema = z.object({ count: z.number().int().nonnegative() });
export type Notification = z.infer<typeof notificationSchema>;
