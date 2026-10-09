import { IsString, ValidateBy } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NEW_PASSWORD_MESSAGE, validNewPassword } from './password.service';

export class ChangePasswordDto {
  @ApiProperty({ format: 'password', writeOnly: true, minLength: 8, maxLength: 128 })
  @IsString()
  @ValidateBy({ name: 'newPassword', validator: { validate: validNewPassword, defaultMessage: () => NEW_PASSWORD_MESSAGE } })
  password!: string;
}
