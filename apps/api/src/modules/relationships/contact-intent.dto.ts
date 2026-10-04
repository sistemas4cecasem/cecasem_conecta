import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
import { ContactIntentState } from '../../generated/prisma/client';
import type { TargetSummary } from '../directory/directory-target.service';
import { ProcessDetailDto } from './relationship-process.dto';

export class CreateContactIntentDto {
  @ApiProperty({ maxLength: 5000 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 5000) purpose!: string;
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() organizationId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() personId?: string;
}
export class CancelContactIntentDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
}
export class ConvertContactIntentDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
}
export class ContactIntentQueryDto {
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @ApiPropertyOptional({ default: 25, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @ApiPropertyOptional({ enum: [...Object.values(ContactIntentState), 'all'], default: 'all' })
  @IsIn([...Object.values(ContactIntentState), 'all']) state: ContactIntentState | 'all' = 'all';
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() authorUserId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() organizationId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() personId?: string;
}
export class ContactIntentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() purpose!: string;
  @ApiProperty({ enum: ContactIntentState }) state!: ContactIntentState;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ format: 'date-time' }) lastActivityAt!: string;
  @ApiProperty({ nullable: true, format: 'date-time' }) cancelledAt!: string | null;
  @ApiProperty({ type: Object }) author!: { id: string; displayName: string; isActive: boolean };
  @ApiProperty({ nullable: true, type: Object }) cancelledBy!: ContactIntentDto['author'] | null;
  @ApiProperty({ type: Object }) target!: TargetSummary;
  @ApiProperty() canCancel!: boolean;
  @ApiProperty() canConvert!: boolean;
  @ApiProperty({ nullable: true, format: 'uuid' }) processId!: string | null;
}
export class ContactIntentPageDto {
  @ApiProperty({ type: [ContactIntentDto] }) items!: ContactIntentDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
export class ConvertedContactIntentDto {
  @ApiProperty({ type: ContactIntentDto }) intent!: ContactIntentDto;
  @ApiProperty({ type: ProcessDetailDto }) process!: ProcessDetailDto;
}
