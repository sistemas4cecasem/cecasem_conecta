import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsIn, IsInt, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
import { OpportunityStatus } from '../../generated/prisma/client';
export class OpportunityDescriptionDto {
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsString()
  @Length(0, 10000)
  description?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsString()
  @Length(0, 2048)
  url?: string | null;
  @ApiPropertyOptional({ nullable: true, example: '2026-12-31', description: 'Fecha civil YYYY-MM-DD, sin hora ni zona horaria.' })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsString()
  deadline?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsString()
  @Length(0, 10000)
  requirements?: string | null;
}
export class CreateOpportunityDto extends OpportunityDescriptionDto {
  @ApiProperty()
  @IsString()
  @Length(1, 300)
  name!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  organizationIds!: string[];
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsUUID()
  processId?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsUUID()
  communicationId?: string | null;
}
export class UpdateOpportunityDto extends OpportunityDescriptionDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(2147483646)
  expectedVersion!: number;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Length(1, 300)
  name?: string;
  @ApiPropertyOptional({ type: [String] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  organizationIds?: string[];
}
export class OpportunityStateDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(2147483646)
  expectedVersion!: number;
  @ApiProperty({ enum: OpportunityStatus })
  @IsEnum(OpportunityStatus)
  status!: OpportunityStatus;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsString()
  @Length(0, 5000)
  finalResult?: string | null;
}
export class DiscardOpportunityDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(2147483646)
  expectedVersion!: number;
  @ApiProperty()
  @IsString()
  @Length(1, 5000)
  reason!: string;
}
export class OpportunityQueryDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
  @ApiPropertyOptional({ enum: [...Object.values(OpportunityStatus), 'all'] })
  @IsIn([...Object.values(OpportunityStatus), 'all'])
  status: OpportunityStatus | 'all' = 'all';
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  organizationId?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  processId?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  communicationId?: string;
}
export class OpportunityHistoryQueryDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Length(1, 1024)
  after?: string;
}
export class OpportunityDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty({ nullable: true })
  description!: string | null;
  @ApiProperty({ nullable: true })
  url!: string | null;
  @ApiProperty({ nullable: true })
  deadline!: string | null;
  @ApiProperty({ nullable: true })
  requirements!: string | null;
  @ApiProperty({ enum: OpportunityStatus })
  status!: OpportunityStatus;
  @ApiProperty({ nullable: true })
  discardReason!: string | null;
  @ApiProperty({ nullable: true })
  finalResult!: string | null;
  @ApiProperty()
  version!: number;
  @ApiProperty()
  createdAt!: string;
  @ApiProperty()
  updatedAt!: string;
  @ApiProperty({ type: Object })
  createdBy!: {
    id: string;
    displayName: string;
    isActive: boolean;
  };
  @ApiProperty({ type: [Object] })
  organizations!: {
    id: string;
    name: string;
    isActive: boolean;
  }[];
  @ApiProperty({ nullable: true, type: Object })
  process!: {
    id: string;
    purpose: string;
  } | null;
  @ApiProperty({ nullable: true, type: Object })
  communication!: {
    id: string;
    subject: string;
    processId: string;
    validity: string;
  } | null;
  @ApiProperty({ enum: OpportunityStatus, isArray: true })
  allowedStatuses!: OpportunityStatus[];
  @ApiProperty()
  canEdit!: boolean;
}
export class OpportunityPageDto {
  @ApiProperty({ type: [OpportunityDto] })
  items!: OpportunityDto[];
  @ApiProperty()
  total!: number;
  @ApiProperty()
  page!: number;
  @ApiProperty()
  pageSize!: number;
}
export class OpportunityHistoryItemDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  source!: 'EVENT' | 'FILE';
  @ApiProperty()
  kind!: 'CREATED' | 'UPDATED' | 'STATUS_CHANGED' | 'DISCARDED' | 'FINISHED' | 'FILES_ATTACHED';
  @ApiProperty()
  createdAt!: string;
  @ApiProperty({ type: Object })
  actor!: OpportunityDto['createdBy'];
  @ApiProperty({ nullable: true, enum: OpportunityStatus })
  previousStatus!: OpportunityStatus | null;
  @ApiProperty({ nullable: true, enum: OpportunityStatus })
  newStatus!: OpportunityStatus | null;
  @ApiProperty({ type: Object })
  changes!: Record<string, unknown>;
}
export class OpportunityHistoryPageDto {
  @ApiProperty({ type: [OpportunityHistoryItemDto] })
  items!: OpportunityHistoryItemDto[];
  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
