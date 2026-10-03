import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsString, IsUUID, Matches, Min } from 'class-validator';

export class DuplicateDecisionDto {
  @ApiProperty() @IsInt() @Min(1) expectedCandidateVersion!: number;
  @ApiProperty() @IsInt() @Min(1) expectedVersionA!: number;
  @ApiProperty() @IsInt() @Min(1) expectedVersionB!: number;
}
export class ConsolidationPreviewDto {
  @ApiProperty() @IsUUID() principalId!: string;
}
export class ConsolidateDto extends DuplicateDecisionDto {
  @ApiProperty() @IsUUID() principalId!: string;
  @ApiProperty() @IsString() @Matches(/^[a-f0-9]{64}$/) previewToken!: string;
  @ApiProperty() @IsBoolean() confirmed!: boolean;
  @ApiProperty() @IsBoolean() reconcileCurrentRelations!: boolean;
  @ApiProperty({ enum: ['KEEP_PRINCIPAL_CONTEXT'] }) @IsIn(['KEEP_PRINCIPAL_CONTEXT']) contactConflictPolicy!: 'KEEP_PRINCIPAL_CONTEXT';
}
