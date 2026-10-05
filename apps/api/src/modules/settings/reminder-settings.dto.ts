import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { REMINDER_INTERVAL_MAX } from '../reminders/reminder.rules';
export class UpdateReminderSettingsDto {
  @ApiProperty({ minimum: 1, maximum: REMINDER_INTERVAL_MAX }) @IsInt() @Min(1) @Max(REMINDER_INTERVAL_MAX) intervalDays!: number;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
}
