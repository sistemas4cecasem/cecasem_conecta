import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsInt, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DataImportRecordKind } from '../../../generated/prisma/client';

export class ImportPreviewRequestDto {
  @ApiProperty({ maxLength: 100 }) @IsString() @Length(1, 100) worksheetName!: string;
  @ApiProperty({ minimum: 1, maximum: 5000 }) @Type(() => Number) @IsInt() @Min(1) @Max(5000) headerRow!: number;
  @ApiProperty({ enum: DataImportRecordKind }) @IsEnum(DataImportRecordKind) recordKind!: DataImportRecordKind;
  @ApiProperty({ description: 'Objeto JSON explícito campo semántico → número de columna; nunca se infiere el encabezado legacy.' })
  @IsString() @MaxLength(4000) columnMapping!: string;
}

export class ImportRowsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 50;
}

export class ImportDecisionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) rowNumber!: number;
  @ApiProperty({ enum: ['organizationName', 'personDisplayName'] }) @IsIn(['organizationName', 'personDisplayName']) field!: 'organizationName' | 'personDisplayName';
  @ApiProperty({ enum: ['CREATE_NEW', 'LINK_EXISTING'] }) @IsIn(['CREATE_NEW', 'LINK_EXISTING']) decision!: 'CREATE_NEW' | 'LINK_EXISTING';
  @ApiPropertyOptional({ format: 'uuid' }) @Transform(({ value }: { value: unknown }) => value === '' ? undefined : value) @ValidateIf((_o, value) => value !== undefined) @IsUUID() targetId?: string;
}

export class ConfirmImportDto {
  @ApiPropertyOptional({ type: [ImportDecisionDto], maxItems: 5000 }) @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => ImportDecisionDto) decisions: ImportDecisionDto[] = [];
}
