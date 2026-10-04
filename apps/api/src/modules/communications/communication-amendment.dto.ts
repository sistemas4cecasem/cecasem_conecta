import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { AmendmentType } from './communication-amendment.rules';
export class CreateAmendmentDto {
  @ApiProperty({ enum: ['CORRECTION', 'ANNOTATION'] }) @IsIn(['CORRECTION', 'ANNOTATION']) type!: 'CORRECTION' | 'ANNOTATION';
  @ApiProperty({ maxLength: 5000 }) @IsString() @Length(1, 5000) content!: string;
}
export class InvalidateCommunicationDto {
  @ApiProperty({ maxLength: 5000 }) @IsString() @Length(1, 5000) reason!: string;
}
export class AmendmentQueryDto {
  @ApiProperty({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
}
export class AmendmentDto {
  @ApiProperty() id!: string;
  @ApiProperty() communicationId!: string;
  @ApiProperty({ enum: ['CORRECTION', 'ANNOTATION', 'INVALIDATION'] }) type!: AmendmentType;
  @ApiProperty() content!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: Object }) author!: { id: string; displayName: string; isActive: boolean };
}
export class AmendmentsPageDto {
  @ApiProperty({ type: [AmendmentDto] }) items!: AmendmentDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
