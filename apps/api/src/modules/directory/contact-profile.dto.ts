import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsUUID, Min, ValidateIf } from 'class-validator';
import { ContactCreateAssociationDto } from './contacts.dto';

export class ProfileContactSnapshotDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id!: string;
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiProperty() @IsInt() @Min(1) methodVersion!: number;
}
export class ProfileContactDto extends ContactCreateAssociationDto {
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() id?: string;
}
