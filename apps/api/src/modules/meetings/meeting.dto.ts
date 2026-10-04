import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { MeetingAttendance, MeetingModality, MeetingStatus } from '../../generated/prisma/client';
export class MeetingPlanningDto {
  @ApiProperty({ example: '2026-10-15T10:00' }) @IsString() @MaxLength(16) scheduledLocal!: string;
  @ApiProperty({ example: 'America/La_Paz' }) @IsString() @MaxLength(100) timezone!: string;
  @ApiPropertyOptional({ enum: ['earlier','later'], description: 'Solo para una hora local repetida por DST.' }) @IsOptional() @IsEnum({ earlier: 'earlier', later: 'later' }) disambiguation?: 'earlier' | 'later';
  @ApiProperty({ enum: MeetingModality }) @IsEnum(MeetingModality) modality!: MeetingModality;
  @ApiPropertyOptional({ nullable:true }) @IsOptional() @IsString() @MaxLength(2048) meetingUrl?: string | null;
  @ApiPropertyOptional({ nullable:true }) @IsOptional() @IsString() @MaxLength(500) location?: string | null;
  @ApiProperty() @IsString() @MaxLength(5000) purpose!: string;
}
export class CreateMeetingDto extends MeetingPlanningDto {
  @ApiPropertyOptional({ format:'uuid',nullable:true }) @IsOptional() @IsUUID() processId?: string | null;
  @ApiPropertyOptional({ format:'uuid',nullable:true }) @IsOptional() @IsUUID() opportunityId?: string | null;
}
export class MeetingCommandDto { @ApiProperty() @IsInt() @Min(1) expectedVersion!: number; }
export class UpdateMeetingDto extends MeetingPlanningDto { @ApiProperty() @IsInt() @Min(1) expectedVersion!: number; }
export class CancelMeetingDto extends MeetingCommandDto { @ApiProperty() @IsString() @MaxLength(5000) reason!: string; }
export class AddMeetingParticipantDto extends MeetingCommandDto {
  @ApiPropertyOptional({nullable:true,format:'uuid'}) @IsOptional() @IsUUID() userId?: string | null;
  @ApiPropertyOptional({nullable:true,format:'uuid'}) @IsOptional() @IsUUID() personId?: string | null;
  @ApiPropertyOptional({nullable:true}) @IsOptional() @IsString() @MaxLength(400) nameSnapshot?: string | null;
  @ApiPropertyOptional({nullable:true}) @IsOptional() @IsString() @MaxLength(300) organizationSnapshot?: string | null;
  @ApiPropertyOptional({nullable:true}) @IsOptional() @IsString() @MaxLength(300) roleSnapshot?: string | null;
}
export class AttendanceMeetingDto extends MeetingCommandDto { @ApiProperty({enum:MeetingAttendance}) @IsEnum(MeetingAttendance) attendance!: MeetingAttendance; }
export class AgreementMeetingDto extends MeetingCommandDto { @ApiProperty() @IsString() @MaxLength(5000) text!: string; }
export class MeetingPageQueryDto {
  @ApiPropertyOptional({default:1}) @Type(()=>Number) @IsInt() @Min(1) page=1;
  @ApiPropertyOptional({default:25,maximum:100}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) pageSize=25;
}
export class MeetingQueryDto extends MeetingPageQueryDto {
  @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() processId?: string;
  @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() opportunityId?: string;
  @ApiPropertyOptional({enum:MeetingStatus}) @IsOptional() @IsEnum(MeetingStatus) status?: MeetingStatus;
}
export class MeetingUsersQueryDto extends MeetingPageQueryDto { @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) search?: string; }
export type MeetingUser = {id:string;displayName:string;isActive:boolean};
export class MeetingDto {
  @ApiProperty({format:'uuid'}) id!:string;
  @ApiProperty({nullable:true}) processId!:string|null;
  @ApiProperty({nullable:true}) opportunityId!:string|null;
  @ApiProperty({format:'date-time'}) scheduledAt!:string;
  @ApiProperty() scheduledLocal!:string;
  @ApiProperty() timezone!:string;
  @ApiProperty({enum:MeetingModality}) modality!:MeetingModality;
  @ApiProperty({nullable:true}) meetingUrl!:string|null;
  @ApiProperty({nullable:true}) location!:string|null;
  @ApiProperty() purpose!:string;
  @ApiProperty({enum:MeetingStatus}) status!:MeetingStatus;
  @ApiProperty({nullable:true}) completedAt!:string|null;
  @ApiProperty({nullable:true}) cancelledAt!:string|null;
  @ApiProperty({nullable:true}) cancellationReason!:string|null;
  @ApiProperty() version!:number;
  @ApiProperty() createdAt!:string;
  @ApiProperty() updatedAt!:string;
  @ApiProperty() createdBy!:MeetingUser;
  @ApiProperty({nullable:true}) process!:{id:string;purpose:string}|null;
  @ApiProperty({nullable:true}) opportunity!:{id:string;name:string}|null;
  @ApiProperty() participantCount!:number;
  @ApiProperty() agreementCount!:number;
  @ApiProperty() canEdit!:boolean;
  @ApiProperty() canComplete!:boolean;
}
export class MeetingPageDto { @ApiProperty({type:[MeetingDto]}) items!:MeetingDto[]; @ApiProperty() total!:number; @ApiProperty() page!:number; @ApiProperty() pageSize!:number; }
export class MeetingParticipantDto {
  @ApiProperty() id!:string; @ApiProperty() meetingId!:string;
  @ApiProperty({nullable:true}) userId!:string|null; @ApiProperty({nullable:true}) personId!:string|null;
  @ApiProperty() nameSnapshot!:string; @ApiProperty({nullable:true}) organizationSnapshot!:string|null; @ApiProperty({nullable:true}) roleSnapshot!:string|null;
  @ApiProperty({enum:MeetingAttendance}) attendance!:MeetingAttendance;
  @ApiProperty() createdAt!:string; @ApiProperty() createdBy!:MeetingUser;
}
export class MeetingAgreementDto { @ApiProperty() id!:string; @ApiProperty() meetingId!:string; @ApiProperty() text!:string; @ApiProperty() createdAt!:string; @ApiProperty() createdBy!:MeetingUser; }
export class MeetingEventDto { @ApiProperty() id!:string; @ApiProperty() meetingId!:string; @ApiProperty() type!:string; @ApiProperty() version!:number; @ApiProperty() snapshot!:object; @ApiProperty() changes!:object; @ApiProperty() createdAt!:string; @ApiProperty() actor!:MeetingUser; }
export class MeetingParticipantsPageDto { @ApiProperty({type:[MeetingParticipantDto]}) items!:MeetingParticipantDto[]; @ApiProperty() total!:number; @ApiProperty() page!:number; @ApiProperty() pageSize!:number; }
export class MeetingAgreementsPageDto { @ApiProperty({type:[MeetingAgreementDto]}) items!:MeetingAgreementDto[]; @ApiProperty() total!:number; @ApiProperty() page!:number; @ApiProperty() pageSize!:number; }
export class MeetingEventsPageDto { @ApiProperty({type:[MeetingEventDto]}) items!:MeetingEventDto[]; @ApiProperty() total!:number; @ApiProperty() page!:number; @ApiProperty() pageSize!:number; }
