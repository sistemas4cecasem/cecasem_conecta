import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OpportunityStatus } from '../../generated/prisma/client';

export class NotificationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(512)
  after?: string;

  @ApiPropertyOptional({ enum: ['all', 'read', 'unread'] })
  @IsOptional() @IsIn(['all', 'read', 'unread'])
  status?: 'all' | 'read' | 'unread';
}

export class NotificationOpportunityDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: OpportunityStatus }) status!: OpportunityStatus;
}
export class NotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['OPPORTUNITY_CREATED'] }) type!: 'OPPORTUNITY_CREATED';
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) readAt!: string | null;
  @ApiProperty({ type: NotificationOpportunityDto }) opportunity!: NotificationOpportunityDto;
}
export class NotificationPageDto {
  @ApiProperty({ type: [NotificationDto] }) items!: NotificationDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class NotificationCountDto {
  @ApiProperty() count!: number;
}
