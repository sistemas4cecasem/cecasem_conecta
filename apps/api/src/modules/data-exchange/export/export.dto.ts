import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { ContactType, OpportunityStatus, ProcessState } from '../../../generated/prisma/client';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class ExportFiltersDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(250) name?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(150) country?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'] }) @IsOptional() @IsIn(['active', 'inactive', 'all']) organizationStatus?: 'active' | 'inactive' | 'all';
  @ApiPropertyOptional({ enum: ['CURRENT', 'REVIEW_DUE', 'NEVER_VERIFIED'] }) @IsOptional() @IsIn(['CURRENT', 'REVIEW_DUE', 'NEVER_VERIFIED']) verificationStatus?: 'CURRENT' | 'REVIEW_DUE' | 'NEVER_VERIFIED';
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }: { value: unknown }) => value === true || value === 'true' ? true : value === false || value === 'false' ? false : value) @IsBoolean() withCommunications?: boolean;
  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'] }) @IsOptional() @IsIn(['active', 'inactive', 'all']) personStatus?: 'active' | 'inactive' | 'all';
  @ApiPropertyOptional({ enum: ContactType }) @IsOptional() @IsIn(Object.values(ContactType)) contactType?: ContactType;
  @ApiPropertyOptional({ enum: ['current', 'historical', 'all'] }) @IsOptional() @IsIn(['current', 'historical', 'all']) relationStatus?: 'current' | 'historical' | 'all';
  @ApiPropertyOptional({ enum: [...Object.values(ProcessState), 'all'] }) @IsOptional() @IsIn([...Object.values(ProcessState), 'all']) processState?: ProcessState | 'all';
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() createdByUserId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() processOrganizationId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() processPersonId?: string;
  @ApiPropertyOptional({ enum: [...Object.values(OpportunityStatus), 'all'] }) @IsOptional() @IsIn([...Object.values(OpportunityStatus), 'all']) opportunityStatus?: OpportunityStatus | 'all';
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() opportunityOrganizationId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() opportunityProcessId?: string;
}

export class ExportRequestDto {
  @ApiPropertyOptional({ type: ExportFiltersDto }) @IsOptional() @ValidateNested() @Type(() => ExportFiltersDto) filters?: ExportFiltersDto;
}
