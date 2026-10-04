import { Body, Controller, Get, Header, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import { MeetingsService } from './meetings.service';
import { MeetingErrorFilter } from './meeting-error.filter';
import { AddMeetingParticipantDto, AgreementMeetingDto, AttendanceMeetingDto, CancelMeetingDto, CreateMeetingDto, MeetingAgreementsPageDto, MeetingCommandDto, MeetingDto, MeetingEventsPageDto, MeetingPageDto, MeetingPageQueryDto, MeetingParticipantsPageDto, MeetingQueryDto, MeetingUsersQueryDto, UpdateMeetingDto } from './meeting.dto';
@ApiTags('meetings') @ApiCookieAuth('cecasem_session') @UseFilters(MeetingErrorFilter) @Controller('meetings')
export class MeetingsController {
 constructor(private readonly meetings:MeetingsService){}
 @Get('internal-users') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.MEETING_PARTICIPANTS)
 internalUsers(@Query() query:MeetingUsersQueryDto,@Req() request:AuthenticatedRequest){return this.meetings.internalUsers(query,request.authenticatedUser.id);}
 @Get() @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.MEETING_READ) @ApiOkResponse({type:MeetingPageDto})
 list(@Query() query:MeetingQueryDto,@Req() request:AuthenticatedRequest){return this.meetings.list(query,request.authenticatedUser.id);}
 @Get(':id') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.MEETING_READ) @ApiOkResponse({type:MeetingDto})
 get(@Param('id',new ParseUUIDPipe())id:string,@Req()request:AuthenticatedRequest){return this.meetings.get(id,request.authenticatedUser.id);}
 @Post() @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.MEETING_CREATE) @ApiHeader({name:'Idempotency-Key',required:true}) @ApiCreatedResponse({type:MeetingDto})
 create(@Body()body:CreateMeetingDto,@Headers('idempotency-key')key:string,@Req()request:AuthenticatedRequest){return this.meetings.create(body,request.authenticatedUser.id,key);}
 @Patch(':id') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.MEETING_UPDATE) @ApiHeader({name:'Idempotency-Key',required:true}) @ApiOkResponse({type:MeetingDto})
 update(@Param('id',new ParseUUIDPipe())id:string,@Body()body:UpdateMeetingDto,@Headers('idempotency-key')key:string,@Req()request:AuthenticatedRequest){return this.meetings.update(id,body,request.authenticatedUser.id,key);}
 @Post(':id/complete') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.MEETING_RESULTS) @ApiHeader({name:'Idempotency-Key',required:true}) @ApiCreatedResponse({type:MeetingDto})
 complete(@Param('id',new ParseUUIDPipe())id:string,@Body()body:MeetingCommandDto,@Headers('idempotency-key')key:string,@Req()request:AuthenticatedRequest){return this.meetings.complete(id,body,request.authenticatedUser.id,key);}
 @Post(':id/cancel') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.MEETING_UPDATE) @ApiHeader({name:'Idempotency-Key',required:true}) @ApiCreatedResponse({type:MeetingDto})
 cancel(@Param('id',new ParseUUIDPipe())id:string,@Body()body:CancelMeetingDto,@Headers('idempotency-key')key:string,@Req()request:AuthenticatedRequest){return this.meetings.cancel(id,body,request.authenticatedUser.id,key);}
 @Post(':id/participants') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.MEETING_PARTICIPANTS) @ApiHeader({name:'Idempotency-Key',required:true}) @ApiCreatedResponse({type:MeetingDto})
 participant(@Param('id',new ParseUUIDPipe())id:string,@Body()body:AddMeetingParticipantDto,@Headers('idempotency-key')key:string,@Req()request:AuthenticatedRequest){return this.meetings.addParticipant(id,body,request.authenticatedUser.id,key);}
 @Patch(':id/participants/:participantId/attendance') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.MEETING_RESULTS) @ApiHeader({name:'Idempotency-Key',required:true}) @ApiOkResponse({type:MeetingDto})
 attendance(@Param('id',new ParseUUIDPipe())id:string,@Param('participantId',new ParseUUIDPipe())participantId:string,@Body()body:AttendanceMeetingDto,@Headers('idempotency-key')key:string,@Req()request:AuthenticatedRequest){return this.meetings.attendance(id,participantId,body,request.authenticatedUser.id,key);}
 @Post(':id/agreements') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.MEETING_RESULTS) @ApiHeader({name:'Idempotency-Key',required:true}) @ApiCreatedResponse({type:MeetingDto})
 agreement(@Param('id',new ParseUUIDPipe())id:string,@Body()body:AgreementMeetingDto,@Headers('idempotency-key')key:string,@Req()request:AuthenticatedRequest){return this.meetings.agreement(id,body,request.authenticatedUser.id,key);}
 @Get(':id/participants') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.MEETING_READ) @ApiOkResponse({type:MeetingParticipantsPageDto})
 participants(@Param('id',new ParseUUIDPipe())id:string,@Query()query:MeetingPageQueryDto,@Req()request:AuthenticatedRequest){return this.meetings.relatedPage(id,'participants',query,request.authenticatedUser.id);}
 @Get(':id/agreements') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.MEETING_READ) @ApiOkResponse({type:MeetingAgreementsPageDto})
 agreements(@Param('id',new ParseUUIDPipe())id:string,@Query()query:MeetingPageQueryDto,@Req()request:AuthenticatedRequest){return this.meetings.relatedPage(id,'agreements',query,request.authenticatedUser.id);}
 @Get(':id/events') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.MEETING_READ) @ApiOkResponse({type:MeetingEventsPageDto})
 events(@Param('id',new ParseUUIDPipe())id:string,@Query()query:MeetingPageQueryDto,@Req()request:AuthenticatedRequest){return this.meetings.relatedPage(id,'events',query,request.authenticatedUser.id);}
}
