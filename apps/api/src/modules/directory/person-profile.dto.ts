import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsString, IsUUID, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { ProfileContactDto, ProfileContactSnapshotDto } from './contact-profile.dto';
import { PersonEditDto } from './people.dto';

export class PersonProfileQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() organizationId?: string;
}
export class ProfileRelationDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id!: string;
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ nullable: true }) @ValidateIf((_o, v) => v != null) @IsString() @MaxLength(250) positionTitle?: string | null;
  @ApiPropertyOptional({ nullable: true }) @ValidateIf((_o, v) => v != null) @IsString() @MaxLength(250) area?: string | null;
}
export class PersonProfileEditDto extends PersonEditDto {
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() organizationId?: string;
  @ApiProperty({ type: [ProfileContactSnapshotDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => ProfileContactSnapshotDto) expectedContacts!: ProfileContactSnapshotDto[];
  @ApiProperty({ type: [ProfileContactDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => ProfileContactDto) contacts!: ProfileContactDto[];
  @ApiProperty({ type: [ProfileRelationDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => ProfileRelationDto) relations!: ProfileRelationDto[];
}
