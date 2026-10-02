import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, ValidateBy } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { UserIdentity } from '../users/user-projections';
import { validLoginPassword } from './password.service';
import { PERMISSIONS, type Permission } from './authorization/permission';
import { getRolePermissions } from './authorization/role-permissions';

export class LoginDto {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ format: 'password', writeOnly: true, maxLength: 128 })
  @IsString()
  @ValidateBy({ name: 'loginPassword', validator: { validate: validLoginPassword,
    defaultMessage: () => 'La contraseña es obligatoria y debe tener como máximo 128 caracteres.' } })
  password!: string;
}

export class AuthenticatedUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() givenNames!: string;
  @ApiProperty() familyNames!: string;
  @ApiProperty() username!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty({ enum: UserRole }) role!: UserRole;
  @ApiProperty({ enum: Object.values(PERMISSIONS), isArray: true }) permissions!: Permission[];
}

export function publicIdentity(user: UserIdentity): AuthenticatedUserDto {
  return { id: user.id, givenNames: user.givenNames, familyNames: user.familyNames,
    username: user.username, email: user.email, role: user.role, permissions: [...getRolePermissions(user.role)] };
}
