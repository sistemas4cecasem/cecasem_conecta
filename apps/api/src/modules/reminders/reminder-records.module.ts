import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RelationshipsModule } from '../relationships/relationships.module';
import { ReminderRecordsService } from './reminder-records.service';
@Module({ imports: [DatabaseModule, RelationshipsModule], providers: [ReminderRecordsService], exports: [ReminderRecordsService] })
export class ReminderRecordsModule {}
