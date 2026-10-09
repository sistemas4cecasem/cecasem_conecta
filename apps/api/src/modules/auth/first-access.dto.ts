import { IsString, IsUUID, ValidateBy } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { INVALID_FIRST_ACCESS_MESSAGE } from './first-access.errors';
import { NEW_PASSWORD_MESSAGE, validNewPassword } from './password.service';

export class IssueFirstAccessDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;
}

export class ConsumeFirstAccessDto {
  @ApiProperty({ writeOnly: true, minLength: 43, maxLength: 43 })
  @IsString({ message: INVALID_FIRST_ACCESS_MESSAGE })
  token!: string;

  @ApiProperty({ format: 'password', writeOnly: true, minLength: 8, maxLength: 128 })
  @ValidateBy({ name: 'newPassword', validator: { validate: validNewPassword, defaultMessage: () => NEW_PASSWORD_MESSAGE } })
  password!: string;
}

export class IssuedFirstAccessDto {
  @ApiProperty({ minLength: 43, maxLength: 43 }) token!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date;
}
