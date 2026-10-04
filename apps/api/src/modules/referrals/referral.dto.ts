import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { ContactType } from '../../generated/prisma/client';
import { PageQueryDto } from '../directory/directory.dto';
import type { ReferralInput } from './referral.rules';
export class CreateReferralDto implements ReferralInput {
  @ApiPropertyOptional({ nullable: true, maxLength: 300 }) @ValidateIf((_o, v) => v != null) @IsString() @MaxLength(300) recommendedName?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 300 }) @ValidateIf((_o, v) => v != null) @IsString() @MaxLength(300) recommendedRole?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 300 }) @ValidateIf((_o, v) => v != null) @IsString() @MaxLength(300) organizationNameSnapshot?: string | null;
  @ApiPropertyOptional({ nullable: true, enum: ContactType }) @ValidateIf((_o, v) => v != null) @IsEnum(ContactType) mediumType?: ContactType | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 2048 }) @ValidateIf((_o, v) => v != null) @IsString() @MaxLength(2048) mediumValue?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 5000 }) @ValidateIf((_o, v) => v != null) @IsString() @MaxLength(5000) notes?: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) @ValidateIf((_o, v) => v != null) @IsUUID() personId?: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) @ValidateIf((_o, v) => v != null) @IsUUID() organizationId?: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) @ValidateIf((_o, v) => v != null) @IsUUID() contactMethodId?: string | null;
}
export class ReferralQueryDto extends PageQueryDto {}
export class ReferralDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) sourceCommunicationId!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: Object }) createdBy!: { id: string; displayName: string; isActive: boolean };
  @ApiProperty({ nullable: true }) recommendedName!: string | null;
  @ApiProperty({ nullable: true }) recommendedRole!: string | null;
  @ApiProperty({ nullable: true }) organizationNameSnapshot!: string | null;
  @ApiProperty({ nullable: true, enum: ContactType }) mediumType!: ContactType | null;
  @ApiProperty({ nullable: true }) mediumValue!: string | null;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty({ type: Object }) source!: { id: string; subject: string; processId: string; validity: string };
  @ApiProperty({ type: Object, nullable: true }) person!: { id: string; label: string; isActive: boolean; currentId: string } | null;
  @ApiProperty({ type: Object, nullable: true }) organization!: { id: string; label: string; isActive: boolean; currentId: string } | null;
  @ApiProperty({ type: Object, nullable: true }) contactMethod!: { id: string; type: ContactType; value: string; condition: string } | null;
}
export class ReferralPageDto {
  @ApiProperty({ type: [ReferralDto] }) items!: ReferralDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
