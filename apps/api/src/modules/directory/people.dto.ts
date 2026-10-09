import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDefined, IsIn, IsInt, IsString, IsUUID, Length, MaxLength, Min, Validate, ValidateIf, ValidateNested, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageQueryDto } from './directory.dto';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value;
export class PersonInputDto {
  @ApiProperty({ maxLength: 250 }) @Transform(trim) @IsString() @Length(1,250) displayName!: string;
  @ApiPropertyOptional({ nullable: true }) @Transform(trim) @ValidateIf((_o,v) => v != null) @IsString() @MaxLength(150) givenNames?: string | null;
  @ApiPropertyOptional({ nullable: true }) @Transform(trim) @ValidateIf((_o,v) => v != null) @IsString() @MaxLength(150) familyNames?: string | null;
}
export class PersonEditDto extends PersonInputDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
}
export class PeopleQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['active','inactive','all'], default:'active' }) @IsIn(['active','inactive','all']) status: 'active' | 'inactive' | 'all' = 'active';
  @ApiPropertyOptional() @Transform(trim) @ValidateIf((_o,v) => v !== undefined) @IsString() @MaxLength(250) name?: string;
  @ApiPropertyOptional({ enum: ['all','without-current','none','historical-only','current'], default:'all', description:'Filtra por la existencia y vigencia de episodios institucionales; omitirlo conserva la consulta histórica sin filtro.' })
  @IsIn(['all','without-current','none','historical-only','current']) institutionalStatus: 'all' | 'without-current' | 'none' | 'historical-only' | 'current' = 'all';
}
export class RelationsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['current','historical','all'], default:'all' }) @IsIn(['current','historical','all']) status: 'current' | 'historical' | 'all' = 'all';
}
export class RelationFieldsDto {
  @ApiPropertyOptional({ nullable:true }) @Transform(trim) @ValidateIf((_o,v) => v != null) @IsString() @MaxLength(250) positionTitle?: string | null;
  @ApiPropertyOptional({ nullable:true }) @Transform(trim) @ValidateIf((_o,v) => v != null) @IsString() @MaxLength(250) area?: string | null;
  @ApiProperty({ default:true }) @IsBoolean() isCurrent = true;
  @ApiPropertyOptional({ nullable:true, example:'2026-10-02', description:'Fecha completa YYYY-MM-DD; null si se desconoce' }) @ValidateIf((_o,v) => v != null) @IsString() @MaxLength(10) startDate?: string | null;
  @ApiPropertyOptional({ nullable:true, example:'2026-10-02' }) @ValidateIf((_o,v) => v != null) @IsString() @MaxLength(10) endDate?: string | null;
  @ApiPropertyOptional({ nullable:true }) @Transform(trim) @ValidateIf((_o,v) => v != null) @IsString() @MaxLength(1000) sourceDescription?: string | null;
  @ApiPropertyOptional({ nullable:true }) @Transform(trim) @ValidateIf((_o,v) => v != null) @IsString() @MaxLength(2048) sourceUrl?: string | null;
  @ApiPropertyOptional({ nullable:true }) @Transform(trim) @ValidateIf((_o,v) => v != null) @IsString() @MaxLength(5000) notes?: string | null;
}
export class RelationCreateDto extends RelationFieldsDto {
  @ApiProperty({ format:'uuid' }) @IsUUID() organizationId!: string;
}
@ValidatorConstraint({ name:'organizationPersonSource', async:false })
class OrganizationPersonSourceConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const input=args.object as OrganizationPersonCreateDto;
    return input.personMode==='new' ? input.person!==undefined && input.personId===undefined :
      input.personMode==='existing' ? input.personId!==undefined && input.person===undefined : false;
  }
  defaultMessage() { return 'Indique una persona nueva o un identificador existente, pero no ambos.'; }
}
export class OrganizationPersonCreateDto extends RelationFieldsDto {
  @ApiProperty({ enum:['new','existing'], description:'new crea la ficha personal; existing añade un episodio a la ficha indicada.' })
  @IsIn(['new','existing']) @Validate(OrganizationPersonSourceConstraint) personMode!: 'new' | 'existing';
  @ApiPropertyOptional({ format:'uuid', description:'Obligatorio cuando personMode es existing.' })
  @ValidateIf((input:OrganizationPersonCreateDto)=>input.personMode==='existing') @IsUUID() personId?: string;
  @ApiPropertyOptional({ type:PersonInputDto, description:'Obligatorio cuando personMode es new.' })
  @ValidateIf((input:OrganizationPersonCreateDto)=>input.personMode==='new') @IsDefined() @ValidateNested() @Type(()=>PersonInputDto) person?: PersonInputDto;
}
export class RelationEditDto extends RelationFieldsDto {
  @ApiProperty({ minimum:1 }) @IsInt() @Min(1) expectedVersion!: number;
}
export class RelationEndDto {
  @ApiProperty({ minimum:1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ nullable:true }) @ValidateIf((_o,v) => v != null) @IsString() @MaxLength(10) endDate?: string | null;
}
