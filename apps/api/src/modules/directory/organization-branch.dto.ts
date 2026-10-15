import { ProfileContactDto, ProfileContactSnapshotDto } from './contact-profile.dto';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsString, IsInt, Min, Length, ValidateIf, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { OrganizationInputDto } from './directory.dto';
import { ContactCreateAssociationDto } from './contacts.dto';

export class OrganizationBranchCreateDto extends OmitType(OrganizationInputDto,['name','country','branchOfId','interestAreas'] as const) {
  @ApiProperty({description:'Lugar de la sede',maxLength:150}) @Transform(({value}: {value:unknown})=>typeof value==='string'?value.trim():value) @IsString() @Length(1,150) country!:string;
  @ApiPropertyOptional({type:[ContactCreateAssociationDto]}) @ValidateIf((_o,v)=>v!==undefined) @IsArray() @ArrayMaxSize(100)
  @ValidateNested({each:true}) @Type(()=>ContactCreateAssociationDto) contactMethods?: ContactCreateAssociationDto[];
}

export class OrganizationBranchEditDto extends OmitType(OrganizationBranchCreateDto,['contactMethods'] as const) {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!:number;
  @ApiProperty({type:[ProfileContactSnapshotDto]}) @IsArray() @ValidateNested({each:true}) @Type(()=>ProfileContactSnapshotDto) expectedContacts!:ProfileContactSnapshotDto[];
  @ApiProperty({type:[ProfileContactDto]}) @IsArray() @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>ProfileContactDto) contacts!:ProfileContactDto[];
}
