import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
export class FilePaginationDto {
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 25, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
}
export class FileMetadataDto {
  @ApiPropertyOptional({ nullable: true }) meetingId?: string | null;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() originalName!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() declaredMimeType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty() sha256!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ nullable: true }) processId!: string | null;
  @ApiProperty({ nullable: true }) communicationId!: string | null;
  @ApiProperty({ nullable: true }) opportunityId!: string | null;
  @ApiProperty() incorporation!: 'PROCESS_ATTACHMENT' | 'LATER_COMMUNICATION_ATTACHMENT' | 'OPPORTUNITY_ATTACHMENT' | 'MEETING_ATTACHMENT';
  @ApiProperty() uploadedBy!: { id: string; displayName: string; isActive: boolean };
}
export class FilePageDto {
  @ApiProperty({ type: [FileMetadataDto] }) items!: FileMetadataDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
