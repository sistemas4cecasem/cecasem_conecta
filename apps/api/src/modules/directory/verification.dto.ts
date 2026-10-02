import { Transform } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class VerifyDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ minimum: 1 }) @ValidateIf((_o,v) => v !== undefined) @IsInt() @Min(1) expectedContactValueVersion?: number;
  @ApiPropertyOptional({ nullable: true }) @Transform(({value}: {value: unknown}) => typeof value === 'string' ? value.trim().replace(/\s+/gu,' ') : value)
  @ValidateIf((_o,v) => v != null) @IsString() @MaxLength(1000) sourceDescription?: string | null;
  @ApiPropertyOptional({ nullable: true }) @ValidateIf((_o,v) => v != null) @IsString() @MaxLength(2048) sourceUrl?: string | null;
}
