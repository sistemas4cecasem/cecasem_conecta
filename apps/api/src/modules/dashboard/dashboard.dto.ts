import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardProcessItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() purpose!: string;
  @ApiProperty() state!: string;
  @ApiProperty({ format: 'date-time' }) lastActivityAt!: string;
  @ApiPropertyOptional() target?: string;
}

export class DashboardOpportunityCountDto {
  @ApiProperty() pendingReview!: number;
  @ApiProperty() preparing!: number;
  @ApiProperty() submitted!: number;
  @ApiProperty() discarded!: number;
  @ApiProperty() finished!: number;
}

export class DashboardMeetingItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() purpose!: string;
  @ApiProperty({ format: 'date-time' }) scheduledAt!: string;
  @ApiProperty() timezone!: string;
  @ApiPropertyOptional({ format: 'uuid' }) processId!: string | null;
  @ApiPropertyOptional({ format: 'uuid' }) opportunityId!: string | null;
  @ApiPropertyOptional() relatedTitle!: string | null;
}

export class DashboardOpportunityItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ format: 'date' }) deadline!: string;
  @ApiProperty() status!: string;
}

export class DashboardReminderItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() type!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty() subject!: string;
  @ApiPropertyOptional({ format: 'uuid' }) processId!: string | null;
  @ApiPropertyOptional({ format: 'uuid' }) intentId!: string | null;
}

export class DashboardResponseDto {
  @ApiProperty({ enum: ['institutional', 'research', 'planning'] }) view!: 'institutional' | 'research' | 'planning';
  @ApiProperty({ format: 'date-time' }) asOf!: string;
  @ApiPropertyOptional() activeProcesses?: number;
  @ApiPropertyOptional() waitingResponseProcesses?: number;
  @ApiPropertyOptional({ type: DashboardOpportunityCountDto }) opportunities?: DashboardOpportunityCountDto;
  @ApiPropertyOptional() upcomingMeetingCount?: number;
  @ApiPropertyOptional({ type: [DashboardMeetingItemDto] }) upcomingMeetings?: DashboardMeetingItemDto[];
  @ApiPropertyOptional() pendingApplications?: number;
  @ApiPropertyOptional() organizationsReviewDue?: number;
  @ApiPropertyOptional() organizationsNeverVerified?: number;
  @ApiPropertyOptional() activeIntents?: number;
  @ApiPropertyOptional({ type: [DashboardProcessItemDto] }) relevantProcesses?: DashboardProcessItemDto[];
  @ApiPropertyOptional({ type: [DashboardProcessItemDto] }) relevantIntents?: DashboardProcessItemDto[];
  @ApiPropertyOptional() unreadReminders?: number;
  @ApiPropertyOptional({ type: [DashboardReminderItemDto] }) reminderItems?: DashboardReminderItemDto[];
  @ApiPropertyOptional() deadlinesInNext30Days?: number;
  @ApiPropertyOptional({ type: [DashboardOpportunityItemDto] }) upcomingDeadlines?: DashboardOpportunityItemDto[];
}
