import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsString, IsUUID, Length, MaxLength, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContactCondition, ContactType } from '../../generated/prisma/client';
import { PageQueryDto } from './directory.dto';
const trimmed = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class ContactInputDto {
  @ApiProperty({ enum: ContactType }) @IsEnum(ContactType) type!: ContactType;
  @ApiProperty({ maxLength: 2048 }) @Transform(trimmed) @IsString() @Length(1,2048) value!: string;
  @ApiPropertyOptional({ nullable:true }) @Transform(trimmed) @ValidateIf((_o,v)=>v!=null) @IsString() @MaxLength(150) label?: string|null;
}
export class ContactCorrectionDto {
  @ApiProperty() @Transform(trimmed) @IsString() @Length(1,2048) value!: string;
  @ApiPropertyOptional({ nullable:true }) @Transform(trimmed) @ValidateIf((_o,v)=>v!=null) @IsString() @MaxLength(150) label?: string|null;
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({default:false}) @IsBoolean() confirmShared = false;
}
export class ContactConditionDto {
  @ApiProperty({enum:ContactCondition}) @IsEnum(ContactCondition) condition!: ContactCondition;
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}
export class ContactContextDto {
  @ApiPropertyOptional({nullable:true}) @Transform(trimmed) @ValidateIf((_o,v)=>v!=null) @IsString() @MaxLength(1000) sourceDescription?: string|null;
  @ApiPropertyOptional({nullable:true}) @Transform(trimmed) @ValidateIf((_o,v)=>v!=null) @IsString() @MaxLength(2048) sourceUrl?: string|null;
  @ApiPropertyOptional({nullable:true}) @Transform(trimmed) @ValidateIf((_o,v)=>v!=null) @IsString() @MaxLength(5000) notes?: string|null;
}
export class ContactCreateAssociationDto extends ContactInputDto {
  @ApiPropertyOptional({nullable:true}) @Transform(trimmed) @ValidateIf((_o,v)=>v!=null) @IsString() @MaxLength(1000) sourceDescription?: string|null;
  @ApiPropertyOptional({nullable:true}) @Transform(trimmed) @ValidateIf((_o,v)=>v!=null) @IsString() @MaxLength(2048) sourceUrl?: string|null;
  @ApiPropertyOptional({nullable:true}) @Transform(trimmed) @ValidateIf((_o,v)=>v!=null) @IsString() @MaxLength(5000) notes?: string|null;
}
export class ContactExistingDto extends ContactContextDto {
  @ApiProperty({format:'uuid'}) @IsUUID() contactMethodId!: string;
  @ApiProperty({description:'Versión del medio revisado antes de confirmar la asociación'}) @IsInt() @Min(1) expectedMethodVersion!: number;
}
export class ContactContextEditDto extends ContactContextDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}
export class ContactEndDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}
export class ContactReplacementDto extends ContactExistingDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty() @IsBoolean() confirmed!: boolean;
}
export class ContactEmailQueryDto {
  @ApiProperty() @Transform(trimmed) @IsString() @Length(1,254) email!: string;
}
export class ContactsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({enum:ContactType}) @ValidateIf((_o,v)=>v!==undefined) @IsEnum(ContactType) type?: ContactType;
}
