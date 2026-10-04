import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
import { RestrictionState } from '../../generated/prisma/client';
import type { TargetSummary } from '../directory/directory-target.service';
export class CreateContactRestrictionDto {
  @ApiProperty({ maxLength: 5000 }) @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 5000) reason!: string;
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() organizationId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() personId?: string;
}
export class LiftContactRestrictionDto {
  @ApiProperty({ maxLength: 5000 }) @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 5000) reason!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
}
export class ContactRestrictionQueryDto {
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @ApiPropertyOptional({ default: 25 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @ApiPropertyOptional({ enum: [...Object.values(RestrictionState), 'all'] }) @IsIn([...Object.values(RestrictionState), 'all']) state: RestrictionState | 'all' = 'all';
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() organizationId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() personId?: string;
}
export class ContactRestrictionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: RestrictionState }) state!: RestrictionState;
  @ApiProperty() version!: number;
  @ApiProperty({ type: Object }) target!: TargetSummary;
  @ApiProperty({ type: Object }) registeredBy!: { id: string; displayName: string; isActive: boolean };
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ nullable: true, format: 'date-time' }) liftedAt!: string | null;
  @ApiProperty({ nullable: true, type: Object }) liftedBy!: ContactRestrictionDto['registeredBy'] | null;
  @ApiProperty({ nullable: true, type: String }) liftReason!: string | null;
  @ApiProperty() canLift!: boolean;
}
export class ContactRestrictionPageDto {
  @ApiProperty({ type: [ContactRestrictionDto] }) items!: ContactRestrictionDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
