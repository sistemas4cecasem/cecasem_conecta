import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsIn, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import type { UserCredentials } from '../users/user-projections';

const normalized = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : value;
const normalizedEmail = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value;

export class UsersQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'active' })
  @IsOptional() @IsIn(['active', 'inactive', 'all']) status: 'active' | 'inactive' | 'all' = 'active';
}
export class CreateUserDto {
  @ApiProperty() @Transform(normalized) @IsString() @Length(1, 150) givenNames!: string;
  @ApiProperty() @Transform(normalized) @IsString() @Length(1, 150) familyNames!: string;
  @ApiProperty({ format: 'email' }) @Transform(normalizedEmail) @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty({ enum: UserRole }) @IsEnum(UserRole) role!: UserRole;
}
export class ChangeRoleDto {
  @ApiProperty({ enum: UserRole }) @IsEnum(UserRole) role!: UserRole;
}
export class CreateEmailAccountDto {
  @ApiProperty({ format: 'email' }) @Transform(normalizedEmail) @IsEmail() @MaxLength(254) address!: string;
  @ApiProperty() @Transform(normalized) @IsString() @Length(1, 150) displayName!: string;
  @ApiPropertyOptional() @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(normalized) @IsString() @Length(1, 150) provider?: string;
}
export class AdministrativeUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() givenNames!: string;
  @ApiProperty() familyNames!: string;
  @ApiProperty() username!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: UserRole }) role!: UserRole;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ nullable: true, type: Date }) deactivatedAt!: Date | null;
  @ApiProperty({ enum: ['PENDING_FIRST_ACCESS', 'ESTABLISHED'] }) credentialStatus!: 'PENDING_FIRST_ACCESS' | 'ESTABLISHED';
}

export function administrativeUser(user: UserCredentials): AdministrativeUserDto {
  return { id: user.id, givenNames: user.givenNames, familyNames: user.familyNames, username: user.username,
    email: user.email, role: user.role, isActive: user.isActive, createdAt: user.createdAt,
    deactivatedAt: user.deactivatedAt, credentialStatus: user.passwordHash === null ? 'PENDING_FIRST_ACCESS' : 'ESTABLISHED' };
}

export class EmailAccountDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() address!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: String, nullable: true }) provider!: string | null;
  @ApiProperty() isActive!: boolean;
}
export function publicEmailAccount(account: EmailAccountDto): EmailAccountDto {
  return { id: account.id, address: account.address, displayName: account.displayName, provider: account.provider, isActive: account.isActive };
}
