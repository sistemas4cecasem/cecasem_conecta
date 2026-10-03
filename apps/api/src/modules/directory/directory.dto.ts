import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value;
export class OrganizationInputDto {
  @ApiProperty({ maxLength: 250 }) @Transform(trim) @IsString() @Length(1, 250) name!: string;
  @ApiPropertyOptional({ nullable: true }) @Transform(trim) @ValidateIf((_o, v) => v != null) @IsString() @MaxLength(150) country?: string | null;
  @ApiPropertyOptional({ nullable: true }) @Transform(trim) @ValidateIf((_o, v) => v != null) @IsString() @MaxLength(150) alias?: string | null;
  @ApiPropertyOptional({ nullable: true }) @Transform(trim) @ValidateIf((_o, v) => v != null) @IsString() @MaxLength(5000) description?: string | null;
  @ApiPropertyOptional({ nullable: true }) @Transform(trim) @ValidateIf((_o, v) => v != null) @IsString() @MaxLength(2048) officialWebsite?: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) @ValidateIf((_o, v) => v != null) @IsUUID() parentId?: string | null;
  @ApiPropertyOptional({ type: [String] }) @ValidateIf((_o, v) => v !== undefined) @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsUUID(undefined, { each: true }) categoryIds?: string[];
}
export class OrganizationEditDto extends OrganizationInputDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
}
export class CategoryInputDto {
  @ApiProperty({ maxLength: 150 }) @Transform(trim) @IsString() @Length(1, 150) name!: string;
}
export class CategoryEditDto extends CategoryInputDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
}
export class DirectoryStatusDto {
  @ApiProperty() @IsBoolean() isActive!: boolean;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
}
export class PageQueryDto {
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @ApiPropertyOptional({ default: 25, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
}
export class DirectoryQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'active' }) @IsIn(['active', 'inactive', 'all']) status: 'active' | 'inactive' | 'all' = 'active';
  @ApiPropertyOptional() @Transform(trim) @ValidateIf((_o, v) => v !== undefined) @IsString() @MaxLength(250) name?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() parentId?: string;
}
export class OrganizationQueryDto extends DirectoryQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Una categoría asociada; sin coincidencias devuelve una lista vacía.' })
  @ValidateIf((_o, v) => v !== undefined) @IsUUID() categoryId?: string;
}
