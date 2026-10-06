import { z } from 'zod';

const processItem = z.object({ id: z.uuid(), purpose: z.string(), state: z.string(), lastActivityAt: z.iso.datetime(), target: z.string().optional() });
const meetingItem = z.object({ id: z.uuid(), purpose: z.string(), scheduledAt: z.iso.datetime(), timezone: z.string(), processId: z.uuid().nullable(), opportunityId: z.uuid().nullable(), relatedTitle: z.string().nullable() });
const opportunityItem = z.object({ id: z.uuid(), name: z.string(), deadline: z.iso.date(), status: z.string() });
const reminderItem = z.object({ id: z.uuid(), type: z.string(), createdAt: z.iso.datetime(), subject: z.string(), processId: z.uuid().nullable(), intentId: z.uuid().nullable() });
const counts = z.object({ pendingReview: z.number(), preparing: z.number(), submitted: z.number(), discarded: z.number(), finished: z.number() });

export const dashboardSchema = z.discriminatedUnion('view', [
  z.object({ view: z.literal('institutional'), asOf: z.iso.datetime(), activeProcesses: z.number(), waitingResponseProcesses: z.number(), opportunities: counts,
    upcomingMeetingCount: z.number(), upcomingMeetings: z.array(meetingItem), pendingApplications: z.number(), organizationsReviewDue: z.number(), organizationsNeverVerified: z.number() }),
  z.object({ view: z.literal('research'), asOf: z.iso.datetime(), activeProcesses: z.number(), relevantProcesses: z.array(processItem), activeIntents: z.number(), relevantIntents: z.array(processItem), unreadReminders: z.number(), reminderItems: z.array(reminderItem) }),
  z.object({ view: z.literal('planning'), asOf: z.iso.datetime(), opportunities: counts, deadlinesInNext30Days: z.number(), upcomingDeadlines: z.array(opportunityItem), upcomingMeetingCount: z.number(), upcomingMeetings: z.array(meetingItem) }),
]);
