import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class SearchQueryDto {
  @ApiPropertyOptional({ description: 'Solo organizaciones: país completo.', maxLength: 150 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value)
  @ValidateIf((_o, v) => v !== undefined) @IsString() @Length(1, 150) organizationCountry?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Solo organizaciones.' })
  @ValidateIf((_o, v) => v !== undefined) @IsUUID() organizationCategoryId?: string;
  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], description: 'Solo organizaciones; intersección con includeInactive.' })
  @ValidateIf((_o, v) => v !== undefined) @IsIn(['active', 'inactive', 'all']) organizationStatus?: 'active' | 'inactive' | 'all';
  @ApiPropertyOptional({ enum: ['CURRENT', 'REVIEW_DUE', 'NEVER_VERIFIED'], description: 'Solo organizaciones.' })
  @ValidateIf((_o, v) => v !== undefined) @IsIn(['CURRENT', 'REVIEW_DUE', 'NEVER_VERIFIED']) organizationVerificationStatus?: 'CURRENT' | 'REVIEW_DUE' | 'NEVER_VERIFIED';
  @ApiPropertyOptional({ description: 'Solo organizaciones: antecedentes externos, incluidas invalidaciones.' })
  @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value)
  @ValidateIf((_o, v) => v !== undefined) @IsBoolean() organizationWithCommunications?: boolean;
  @ApiProperty({ minLength: 2, maxLength: 254 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value)
  @IsString() @Length(2, 254) q!: string;
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
  @ApiPropertyOptional({ default: 25, maximum: 50 }) @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 25;
  @ApiPropertyOptional({ default: false })
  @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean() includeInactive = false;
}
