import { ApiProperty } from '@nestjs/swagger';
export class CommunicationTranslationDto {
  @ApiProperty() id!: string;
  @ApiProperty() communicationId!: string;
  @ApiProperty({ enum: ['es'] }) targetLanguage!: string;
  @ApiProperty({ type: String, nullable: true }) detectedSourceLanguage!: string | null;
  @ApiProperty() translatedText!: string;
  @ApiProperty() createdAt!: string;
}
