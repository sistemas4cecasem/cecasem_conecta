import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsString, Length, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class SearchQueryDto {
  @ApiProperty({ minLength: 2, maxLength: 254 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value)
  @IsString() @Length(2, 254) q!: string;
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
  @ApiPropertyOptional({ default: 25, maximum: 50 }) @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 25;
  @ApiPropertyOptional({ default: false })
  @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean() includeInactive = false;
}
