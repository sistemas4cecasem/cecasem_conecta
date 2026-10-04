import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import type { ProcessResult, ProcessState } from '../../generated/prisma/client';
import { ProcessUserDto } from './relationship-process.dto';
import type { AmendmentDto } from '../communications/communication-amendment.dto';
import type { ReferralDto } from '../referrals/referral.dto';

export const TIMELINE_KINDS = ['MEETING_ACTIVITY', 'REFERRAL_CREATED', 'FILES_ATTACHED', 'SENT_COMMUNICATION', 'RECEIVED_COMMUNICATION', 'PROCESS_CREATED', 'PROCESS_STATE_CHANGED', 'PROCESS_CLOSED', 'PROCESS_REOPENED', 'INTERNAL_NOTE', 'COMMUNICATION_CORRECTED', 'COMMUNICATION_ANNOTATED', 'COMMUNICATION_INVALIDATED'] as const;
type BaseItem = { id: string; occurredAt: string; registeredAt: string; actor: ProcessUserDto; summary: string };
export type TimelineItem = BaseItem & (
  { kind: 'MEETING_ACTIVITY'; payload: { meetingId: string; type: string; snapshot: Record<string, unknown>; changes: Record<string, unknown> } }
  |
  { kind: 'REFERRAL_CREATED'; payload: { referralId: string; communicationId: string; referral: ReferralDto } }
  |
  { kind: 'SENT_COMMUNICATION' | 'RECEIVED_COMMUNICATION'; payload: { communicationId: string; sender: string; subject: string; recipients: { type: 'TO' | 'CC' | 'BCC'; addressOriginal: string; position: number }[]; recipientTotal: number; validity?: 'VALID' | 'INVALIDATED'; invalidation?: AmendmentDto | null } }
  | { kind: 'COMMUNICATION_CORRECTED' | 'COMMUNICATION_ANNOTATED' | 'COMMUNICATION_INVALIDATED'; payload: { amendmentId: string; communicationId: string; content: string } }
  | { kind: 'PROCESS_CREATED' | 'PROCESS_STATE_CHANGED' | 'PROCESS_CLOSED' | 'PROCESS_REOPENED'; payload: { eventId: string; previousState: ProcessState | null; newState: ProcessState; result: ProcessResult | null; observation: string | null } }
  | { kind: 'FILES_ATTACHED'; payload: { uploadId: string; meetingId?: string | null; communicationId: string | null; names: string[] } }
  | { kind: 'INTERNAL_NOTE'; payload: { noteId: string; body: string } }
);
export class TimelineQueryDto {
  @ApiPropertyOptional({ default: 25, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @ApiPropertyOptional({ description: 'Cursor opaco devuelto por la página anterior.' }) @ValidateIf((_o, v) => v !== undefined) @IsString() @Length(1, 1024) after?: string;
}
export class TimelineItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: TIMELINE_KINDS }) kind!: TimelineItem['kind'];
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty({ format: 'date-time' }) registeredAt!: string;
  @ApiProperty({ type: ProcessUserDto }) actor!: ProcessUserDto;
  @ApiProperty() summary!: string;
  @ApiProperty({ type: Object, description: 'Payload discriminado por kind: comunicación (snapshots sin cuerpo), evento (estados/resultado/observación) o nota interna (body).' }) payload!: TimelineItem['payload'];
}
export class TimelinePageDto {
  @ApiProperty({ type: [TimelineItemDto], maxItems: 100 }) items!: TimelineItem[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}
export class CreateInternalNoteDto {
  @ApiProperty({ maxLength: 5000 }) @IsString() @Length(1, 5000) @MaxLength(5000) body!: string;
}
