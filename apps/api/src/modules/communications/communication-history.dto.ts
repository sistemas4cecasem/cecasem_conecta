import { ApiProperty } from '@nestjs/swagger';
import { CommunicationDirection, RecipientType } from '../../generated/prisma/client';
import { CommunicationSummaryDto } from './communication.dto';

export class CommunicationHistoryProcessDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() purpose!: string;
}
export class CommunicationHistoryRecipientDto {
  @ApiProperty({ enum: RecipientType }) type!: RecipientType;
  @ApiProperty() addressOriginal!: string;
  @ApiProperty() position!: number;
}
export class CommunicationHistoryItemDto extends CommunicationSummaryDto {
  @ApiProperty() sender!: string;
  @ApiProperty({ type: CommunicationHistoryProcessDto }) process!: CommunicationHistoryProcessDto;
  @ApiProperty({ type: [CommunicationHistoryRecipientDto], maxItems: 10 }) recipients!: CommunicationHistoryRecipientDto[];
  @ApiProperty() recipientTotal!: number;
}
export class CommunicationHistorySummaryDto {
  @ApiProperty() total!: number;
  @ApiProperty({ format: 'date-time', nullable: true }) lastOccurredAt!: string | null;
  @ApiProperty({ enum: CommunicationDirection, nullable: true }) lastDirection!: CommunicationDirection | null;
}
