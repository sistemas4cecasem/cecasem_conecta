import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsInt, IsISO8601, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { CommunicationDirection, CommunicationValidity, RecipientType } from '../../generated/prisma/client';
import { AmendmentDto } from './communication-amendment.dto';
class CommunicationOriginalDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsEmail({}, { each: true }) @MaxLength(254, { each: true }) to!: string[];
  @ApiPropertyOptional({ type: [String] }) @ValidateIf((_o, v) => v !== undefined) @IsArray() @ArrayMaxSize(100) @IsEmail({}, { each: true }) @MaxLength(254, { each: true }) cc: string[] = [];
  @ApiPropertyOptional({ type: [String] }) @ValidateIf((_o, v) => v !== undefined) @IsArray() @ArrayMaxSize(100) @IsEmail({}, { each: true }) @MaxLength(254, { each: true }) bcc: string[] = [];
  @ApiProperty({ maxLength: 998 }) @IsString() @Length(1, 998) subject!: string;
  @ApiProperty({ maxLength: 200000 }) @IsString() @Length(1, 200000) body!: string;
}
export class CreateSentCommunicationDto extends CommunicationOriginalDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() emailAccountId!: string;
  @ApiProperty({ format: 'date-time' }) @IsISO8601({ strict: true, strictSeparator: true }) sentAt!: string;
}
export class CreateReceivedCommunicationDto extends CommunicationOriginalDto {
  @ApiProperty({ maxLength: 254 }) @IsEmail() @MaxLength(254) sender!: string;
  @ApiProperty({ format: 'date-time' }) @IsISO8601({ strict: true, strictSeparator: true }) receivedAt!: string;
}
export class CommunicationPaginationDto {
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @ApiPropertyOptional({ default: 25 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
}
export class AvailableCommunicationAccountDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() address!: string;
  @ApiProperty() displayName!: string;
}
export class CommunicationRecipientDto {
  @ApiProperty({ type: Object, nullable: true }) emailAccount!: { id: string; displayName: string } | null;
  @ApiProperty({ enum: RecipientType }) type!: RecipientType;
  @ApiProperty() addressOriginal!: string;
  @ApiProperty() normalizedAddress!: string;
  @ApiProperty() position!: number;
}
export class CommunicationSummaryDto {
  @ApiProperty({ enum: CommunicationValidity }) validity!: CommunicationValidity;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) processId!: string;
  @ApiProperty({ enum: CommunicationDirection }) direction!: CommunicationDirection;
  @ApiProperty() subject!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) sentAt!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true }) receivedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class CommunicationDto extends CommunicationSummaryDto {
  @ApiProperty({ type: AmendmentDto, nullable: true }) invalidation!: AmendmentDto | null;
  @ApiProperty() version!: number;
  @ApiProperty({ type: AvailableCommunicationAccountDto, nullable: true }) emailAccount!: AvailableCommunicationAccountDto | null;
  @ApiProperty() sender!: string;
  @ApiProperty({ type: [CommunicationRecipientDto] }) recipients!: CommunicationRecipientDto[];
  @ApiProperty() bodyOriginal!: string;
  @ApiProperty({ type: Object }) registeredBy!: { id: string; displayName: string; isActive: boolean };
}
export class CommunicationsPageDto {
  @ApiProperty({ type: [CommunicationSummaryDto] }) items!: CommunicationSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
