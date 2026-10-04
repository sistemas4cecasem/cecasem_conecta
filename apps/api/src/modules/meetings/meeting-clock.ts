import { Injectable } from '@nestjs/common';
@Injectable()
export class MeetingClock { now(): Date { return new Date(); } }
