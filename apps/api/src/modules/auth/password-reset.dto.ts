import { IsString, IsUUID, ValidateBy } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { INVALID_PASSWORD_RESET_MESSAGE } from './password-reset.errors';
import { NEW_PASSWORD_MESSAGE, validNewPassword } from './password.service';

export class IssuePasswordResetDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() userId!: string;
}
export class ConsumePasswordResetDto {
  @ApiProperty({ writeOnly: true, minLength: 43, maxLength: 43 })
  @IsString({ message: INVALID_PASSWORD_RESET_MESSAGE }) token!: string;

  @ApiProperty({ format: 'password', writeOnly: true, minLength: 8, maxLength: 128 })
  @ValidateBy({ name: 'newPassword', validator: { validate: validNewPassword, defaultMessage: () => NEW_PASSWORD_MESSAGE } })
  password!: string;
}
export class IssuedPasswordResetDto {
  @ApiProperty({ minLength: 43, maxLength: 43 }) token!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date;
}
