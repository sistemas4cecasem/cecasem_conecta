import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType, OpportunityStatus } from '../../generated/prisma/client';

export class NotificationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(512)
  after?: string;

  @ApiPropertyOptional({ enum: ['all', 'read', 'unread'] })
  @IsOptional() @IsIn(['all', 'read', 'unread'])
  status?: 'all' | 'read' | 'unread';
}

export class NotificationOpportunityDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: OpportunityStatus }) status!: OpportunityStatus;
}
export class NotificationMeetingDto {
  @ApiProperty() id!: string;
  @ApiProperty() scheduledAt!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty() purpose!: string;
  @ApiProperty({type:String,nullable:true}) processId!: string | null;
  @ApiProperty({type:String,nullable:true}) opportunityId!: string | null;
}
export class NotificationDto {
  @ApiProperty({ type: Object, nullable: true }) process!: { id: string; purpose: string; context: string; occurredAt: string } | null;
  @ApiProperty({ type: Object, nullable: true }) reminder!: { id: string; intentId: string | null; processId: string | null; inactivityAnchorAt: string; dueAt: string; intervalDays: number; purpose: string; context: string } | null;
  @ApiProperty() id!: string;
  @ApiProperty({ enum: NotificationType }) type!: NotificationType;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) readAt!: string | null;
  @ApiProperty({ type: NotificationOpportunityDto, nullable: true }) opportunity!: NotificationOpportunityDto | null;
  @ApiProperty({ type: NotificationMeetingDto, nullable: true }) meeting!: NotificationMeetingDto | null;
}
export class NotificationPageDto {
  @ApiProperty({ type: [NotificationDto] }) items!: NotificationDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class NotificationCountDto {
  @ApiProperty() count!: number;
}
