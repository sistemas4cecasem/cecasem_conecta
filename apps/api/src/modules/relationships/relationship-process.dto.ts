import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
import { ParticipantOrigin, ProcessAuthority, ProcessEventType, ProcessResult, ProcessState } from '../../generated/prisma/client';
import type { TargetSummary } from '../directory/directory-target.service';
import { OPEN_PROCESS_STATES } from './relationship-process.rules';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateRelationshipProcessDto {
  @ApiProperty({ maxLength: 5000 }) @Transform(trim) @IsString() @Length(1, 5000) purpose!: string;
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() organizationId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() personId?: string;
}
export class ProcessPaginationDto {
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @ApiPropertyOptional({ default: 25, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
}
export class ProcessQueryDto extends ProcessPaginationDto {
  @ApiPropertyOptional({ enum: [...Object.values(ProcessState), 'all'], default: 'all' }) @IsIn([...Object.values(ProcessState), 'all']) state: ProcessState | 'all' = 'all';
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() createdByUserId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() organizationId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() personId?: string;
}
class VersionedProcessDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
}
export class ChangeProcessStateDto extends VersionedProcessDto {
  @ApiProperty({ enum: OPEN_PROCESS_STATES }) @IsIn(OPEN_PROCESS_STATES) state!: ProcessState;
  @ApiPropertyOptional({ maxLength: 5000 }) @ValidateIf((_o, v) => v !== undefined) @Transform(trim) @IsString() @Length(1, 5000) reason?: string;
}
export class CloseProcessDto extends VersionedProcessDto {
  @ApiProperty({ enum: ProcessResult }) @IsEnum(ProcessResult) result!: ProcessResult;
  @ApiPropertyOptional({ maxLength: 5000 }) @ValidateIf((_o, v) => v !== undefined) @Transform(trim) @IsString() @Length(1, 5000) observation?: string;
}
export class ReopenProcessDto extends VersionedProcessDto {
  @ApiProperty({ enum: OPEN_PROCESS_STATES }) @IsIn(OPEN_PROCESS_STATES) state!: ProcessState;
  @ApiProperty({ maxLength: 5000 }) @Transform(trim) @IsString() @Length(1, 5000) reason!: string;
}
export class ProcessUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() isActive!: boolean;
}
export class ProcessParticipantDto {
  @ApiProperty({ type: ProcessUserDto }) user!: ProcessUserDto;
  @ApiProperty({ enum: ParticipantOrigin }) origin!: ParticipantOrigin;
  @ApiProperty({ format: 'date-time' }) joinedAt!: string;
}
export class ProcessEventDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ProcessEventType }) type!: ProcessEventType;
  @ApiProperty({ enum: ProcessState, nullable: true }) previousState!: ProcessState | null;
  @ApiProperty({ enum: ProcessState }) newState!: ProcessState;
  @ApiProperty({ enum: ProcessResult, nullable: true }) result!: ProcessResult | null;
  @ApiProperty({ nullable: true }) observation!: string | null;
  @ApiProperty({ type: ProcessUserDto }) actor!: ProcessUserDto;
  @ApiProperty({ enum: ProcessAuthority }) authority!: ProcessAuthority;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class RelationshipProcessDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() purpose!: string;
  @ApiProperty({ type: Object }) target!: TargetSummary;
  @ApiProperty({ type: ProcessUserDto }) createdBy!: ProcessUserDto;
  @ApiProperty({ format: 'uuid', nullable: true }) sourceIntentId!: string | null;
  @ApiProperty({ enum: ProcessState }) state!: ProcessState;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ format: 'date-time' }) lastActivityAt!: string;
  @ApiProperty({ enum: ProcessResult, nullable: true }) currentResult!: ProcessResult | null;
  @ApiProperty({ nullable: true }) closureObservation!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true }) closedAt!: string | null;
  @ApiProperty({ type: ProcessUserDto, nullable: true }) closedBy!: ProcessUserDto | null;
  @ApiProperty({ enum: ProcessState, isArray: true }) allowedStates!: ProcessState[];
  @ApiProperty() canClose!: boolean;
  @ApiProperty() canReopen!: boolean;
  @ApiProperty() exceptionalAdministration!: boolean;
}
export class ProcessDetailDto extends RelationshipProcessDto {
  @ApiProperty({ type: [ProcessParticipantDto] }) participants!: ProcessParticipantDto[];
  @ApiProperty({ type: [ProcessEventDto] }) events!: ProcessEventDto[];
  @ApiProperty() eventsTotal!: number;
}
export class ProcessPageDto {
  @ApiProperty({ type: [RelationshipProcessDto] }) items!: RelationshipProcessDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
export class ProcessEventPageDto {
  @ApiProperty({ type: [ProcessEventDto] }) items!: ProcessEventDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
