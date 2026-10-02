import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class VerificationSettingsDto {
  @ApiProperty({ minimum: 1, maximum: 120 }) @IsInt() @Min(1) @Max(120) personalVerificationMonths!: number;
  @ApiProperty({ minimum: 1, maximum: 120 }) @IsInt() @Min(1) @Max(120) institutionalVerificationMonths!: number;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
}
