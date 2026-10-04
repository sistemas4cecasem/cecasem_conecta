import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';
import { ProcessResult, ProcessState } from '../../generated/prisma/client';
import type { TargetSummary } from '../directory/directory-target.service';
import { CommunicationHistoryItemDto, CommunicationHistorySummaryDto } from '../communications/communication-history.dto';
export class RelationshipContextQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() organizationId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() personId?: string;
}
export class ContextUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() isActive!: boolean;
}
export class ContextRestrictionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class ContextIntentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() purpose!: string;
  @ApiProperty({ type: Object }) target!: TargetSummary;
  @ApiProperty({ type: ContextUserDto }) author!: ContextUserDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) lastActivityAt!: string;
}
export class ContextProcessDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() purpose!: string;
  @ApiProperty({ enum: ProcessState }) state!: ProcessState;
  @ApiProperty({ type: Object }) target!: TargetSummary;
  @ApiProperty({ type: ContextUserDto }) createdBy!: ContextUserDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) lastActivityAt!: string;
  @ApiProperty({ enum: ProcessResult, nullable: true }) result!: ProcessResult | null;
  @ApiProperty({ format: 'date-time', nullable: true }) closedAt!: string | null;
}
export class ContextIntentsDto {
  @ApiProperty({ type: [ContextIntentDto] }) items!: ContextIntentDto[];
  @ApiProperty() total!: number;
}
export class ContextProcessesDto {
  @ApiProperty({ type: [ContextProcessDto] }) items!: ContextProcessDto[];
  @ApiProperty() total!: number;
}
export class ActorContextDto {
  @ApiProperty({ type: Object }) target!: TargetSummary;
  @ApiProperty({ type: ContextRestrictionDto, nullable: true }) restriction!: ContextRestrictionDto | null;
  @ApiProperty({ description: 'Solo ausencia de restricción para este actor exacto; no sustituye validación de escritura.' }) contactAllowed!: boolean;
  @ApiProperty({ type: ContextIntentsDto }) activeIntents!: ContextIntentsDto;
  @ApiProperty({ type: ContextProcessesDto }) activeProcesses!: ContextProcessesDto;
  @ApiProperty({ type: ContextProcessesDto }) recentClosedProcesses!: ContextProcessesDto;
  @ApiProperty() hasRelationshipHistory!: boolean;
  @ApiProperty() hasRegisteredCommunicationHistory!: boolean;
  @ApiProperty({ type: CommunicationHistorySummaryDto }) communicationSummary!: CommunicationHistorySummaryDto;
  @ApiProperty({ type: [CommunicationHistoryItemDto], maxItems: 5 }) recentCommunications!: CommunicationHistoryItemDto[];
}
export class RelatedOrganizationContextDto {
  @ApiProperty({ type: [ActorContextDto] }) items!: ActorContextDto[];
  @ApiProperty() total!: number;
}
export class RelationshipContextDto extends ActorContextDto {
  @ApiProperty({ type: RelatedOrganizationContextDto }) relatedOrganizationContext!: RelatedOrganizationContextDto;
}
