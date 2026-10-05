import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, type MeetingEventType } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import type { UserIdentity } from '../users/user-projections';
import { PERMISSIONS, type Permission } from '../auth/authorization/permission';
import { hasPermission } from '../auth/authorization/role-permissions';
import { RelationshipProcessesService } from '../relationships/relationship-processes.service';
import { ProcessParticipationService } from '../relationships/process-participation.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { DirectoryReferralsService, UnavailableReferralReference } from '../directory/directory-referrals.service';
import { AuditService } from '../audit/audit.service';
import { MeetingClock } from './meeting-clock';
import { canAttachMeeting, meetingFingerprint, meetingLocal, meetingOrigin, meetingParticipant, meetingPlanning, meetingText, meetingVersion, MeetingError, requireFuture, requireResults } from './meeting.rules';
import type { AddMeetingParticipantDto, AgreementMeetingDto, AttendanceMeetingDto, CancelMeetingDto, CreateMeetingDto, MeetingCommandDto, MeetingDto, MeetingPageQueryDto, MeetingQueryDto, MeetingUsersQueryDto, UpdateMeetingDto } from './meeting.dto';
import type { TimelineItem } from '../relationships/timeline.dto';
import { timelineSeek, type TimelinePosition } from '../relationships/timeline.rules';
const userSelect = { id: true, givenNames: true, familyNames: true, isActive: true } as const;
const meetingSelect = { id:true, processId:true, opportunityId:true, scheduledAt:true, timezone:true, modality:true, meetingUrl:true, location:true, purpose:true,
  status:true, completedAt:true, cancelledAt:true, cancellationReason:true, version:true, createdAt:true, updatedAt:true,
  createdBy:{select:userSelect}, process:{select:{id:true,purpose:true}}, opportunity:{select:{id:true,name:true}}, _count:{select:{participants:true,agreements:true}} } satisfies Prisma.MeetingSelect;
type Row = Prisma.MeetingGetPayload<{select:typeof meetingSelect}>;
const eventSelect = {id:true,meetingId:true,type:true,version:true,snapshot:true,changes:true,createdAt:true,actor:{select:userSelect}} satisfies Prisma.MeetingEventSelect;
const publicUser = (row:{id:string;givenNames:string;familyNames:string;isActive:boolean}) => ({id:row.id,displayName:row.givenNames+' '+row.familyNames,isActive:row.isActive});
const planning = (row:Row) => ({scheduledAt:row.scheduledAt.toISOString(),timezone:row.timezone,modality:row.modality,meetingUrl:row.meetingUrl,location:row.location,purpose:row.purpose});
@Injectable()
export class MeetingsService {
  constructor(private readonly prisma:PrismaService, private readonly users:UsersService, private readonly processes:RelationshipProcessesService,
    private readonly participation:ProcessParticipationService, private readonly opportunities:OpportunitiesService, private readonly directory:DirectoryReferralsService,
    private readonly audit:AuditService, private readonly clock:MeetingClock) {}
  private authorize(actor:UserIdentity|null, permission:Permission) { if(!actor?.isActive || !hasPermission(actor.role,permission)) throw new MeetingError('FORBIDDEN'); return actor; }
  private async context(origin:{processId:string|null;opportunityId:string|null}, actor:UserIdentity, tx:Prisma.TransactionClient, locking=false) {
    try {
      if(origin.processId) { this.authorize(actor,PERMISSIONS.PROCESS_READ); if(locking) await this.processes.lockForCommunication(origin.processId,tx); else await this.processes.requireOpportunityOrigin(origin.processId,tx); }
      if(origin.opportunityId) { this.authorize(actor,PERMISSIONS.OPPORTUNITY_READ); const opportunity=await this.opportunities.requireMeetingOpportunity(origin.opportunityId,tx,locking);
        if(origin.processId && opportunity.processId && origin.processId!==opportunity.processId) throw new MeetingError('INVALID_MEETING_ORIGIN'); }
    } catch(error) { if(error instanceof Error && 'code' in error && ['PROCESS_NOT_FOUND','OPPORTUNITY_NOT_FOUND'].includes(String(error.code))) throw new MeetingError('INVALID_MEETING_ORIGIN'); throw error; }
  }
  private async row(id:string,tx:Prisma.TransactionClient) { const row=await tx.meeting.findUnique({where:{id},select:meetingSelect}); if(!row)throw new MeetingError('MEETING_NOT_FOUND'); return row; }
  private contract(row:Row):MeetingDto { const now=this.clock.now(); return { ...planning(row), id:row.id,processId:row.processId,opportunityId:row.opportunityId,scheduledLocal:meetingLocal(row.scheduledAt,row.timezone),
    status:row.status,completedAt:row.completedAt?.toISOString()??null,cancelledAt:row.cancelledAt?.toISOString()??null,cancellationReason:row.cancellationReason,
    createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),version:row.version,createdBy:publicUser(row.createdBy),process:row.process,opportunity:row.opportunity,
    participantCount:row._count.participants,agreementCount:row._count.agreements,canEdit:row.status==='SCHEDULED' && +row.scheduledAt>+now,canComplete:row.status==='SCHEDULED' && +row.scheduledAt<=+now }; }
  private async record(row:Row,type:MeetingEventType,changes:Prisma.InputJsonObject,actorId:string,key:string,fingerprint:string,tx:Prisma.TransactionClient,
    links:{participantId?:string;agreementId?:string}={}) {
    const now=this.clock.now(), event=await tx.meetingEvent.create({data:{meetingId:row.id,type,version:row.version,snapshot:{...planning(row),participantCount:row._count.participants,opportunity:row.opportunity},changes,
      ...links,actorUserId:actorId,requestKey:key,requestFingerprint:fingerprint,createdAt:now}});
    await this.audit.recordMeeting(event.id,actorId,tx);
    const realActivity=type==='COMPLETED'||type==='ATTENDANCE_RECORDED'||type==='AGREEMENT_ADDED'||(type==='PARTICIPANT_ADDED'&&row.status==='COMPLETED')||(type==='CREATED'&&+row.scheduledAt<=+now);
    if(row.processId) {
      if(type==='CREATED'||realActivity) await this.participation.ensureParticipant(row.processId,actorId,'MEETING_CREATED',tx);
      if(realActivity) await this.processes.recordMeetingActivity(row.processId,now,tx);
    }
    return this.contract(row);
  }
  async create(input:CreateMeetingDto,actorId:string,key:string) {
    const values=meetingPlanning(input),origin=meetingOrigin(input),fingerprint=meetingFingerprint({type:'CREATED',...origin,...values},key);
    return this.users.withLockedCredentials(actorId,async(current,tx)=>{
      const actor=this.authorize(current,PERMISSIONS.MEETING_CREATE),prior=await tx.meetingEvent.findUnique({where:{actorUserId_requestKey:{actorUserId:actorId,requestKey:key}}});
      if(prior) { if(prior.requestFingerprint!==fingerprint)throw new MeetingError('REQUEST_CONFLICT'); const row=await this.row(prior.meetingId,tx); await this.context(row,actor,tx); return this.contract(row); }
      await this.context(origin,actor,tx,true); const now=this.clock.now();
      const row=await tx.meeting.create({data:{...values,...origin,createdByUserId:actorId,createdAt:now,updatedAt:now,requestKey:key,requestFingerprint:fingerprint},select:meetingSelect});
      return this.record(row,'CREATED',{next:planning(row)},actorId,key,fingerprint,tx);
    });
  }
  private async command(id:string,input:MeetingCommandDto,actorId:string,key:string,type:MeetingEventType,permission:Permission,payload:unknown,
    operation:(row:Row,tx:Prisma.TransactionClient)=>Promise<{row:Row;changes:Prisma.InputJsonObject;participantId?:string;agreementId?:string}>,participantUserId?:string|null) {
    meetingVersion(input.expectedVersion); const fingerprint=meetingFingerprint({id,type,expectedVersion:input.expectedVersion,payload},key);
    return this.users.withLockedCredentials(actorId,async(current,tx)=>{
      const actor=this.authorize(current,permission);
      const prior=await tx.meetingEvent.findUnique({where:{actorUserId_requestKey:{actorUserId:actorId,requestKey:key}}});
      if(prior) { if(prior.requestFingerprint!==fingerprint)throw new MeetingError('REQUEST_CONFLICT'); const row=await this.row(prior.meetingId,tx); await this.context(row,actor,tx); return this.contract(row); }
      await tx.$queryRaw`SELECT id FROM "Meeting" WHERE id=${id}::uuid FOR UPDATE`;
      const row=await this.row(id,tx); await this.context(row,actor,tx,true);
      if(row.version!==input.expectedVersion)throw new MeetingError('VERSION_CONFLICT');
      const result=await operation(row,tx);
      return this.record(result.row,type,result.changes,actorId,key,fingerprint,tx,{...(result.participantId?{participantId:result.participantId}:{}),...(result.agreementId?{agreementId:result.agreementId}:{})});
    },participantUserId?{actorId:participantUserId}:{});
  }
  private updateRow(id:string,data:Prisma.MeetingUpdateInput,tx:Prisma.TransactionClient) { return tx.meeting.update({where:{id},data:{...data,version:{increment:1},updatedAt:this.clock.now()},select:meetingSelect}); }
  update(id:string,input:UpdateMeetingDto,actorId:string,key:string) {
    const values=meetingPlanning(input);
    return this.command(id,input,actorId,key,'UPDATED',PERMISSIONS.MEETING_UPDATE,values,async(row,tx)=>{
      requireFuture(row.status,row.scheduledAt,this.clock.now()); if(+values.scheduledAt<=+this.clock.now())throw new MeetingError('MEETING_STATE_CONFLICT');
      const next=await this.updateRow(id,values,tx); return {row:next,changes:{previous:planning(row),next:planning(next)}};
    });
  }
  complete(id:string,input:MeetingCommandDto,actorId:string,key:string) {
    return this.command(id,input,actorId,key,'COMPLETED',PERMISSIONS.MEETING_RESULTS,{},async(row,tx)=>{
      if(row.status!=='SCHEDULED'||+row.scheduledAt>+this.clock.now())throw new MeetingError('MEETING_STATE_CONFLICT');
      return {row:await this.updateRow(id,{status:'COMPLETED',completedAt:this.clock.now()},tx),changes:{previousStatus:row.status,nextStatus:'COMPLETED'}};
    });
  }
  cancel(id:string,input:CancelMeetingDto,actorId:string,key:string) {
    const reason=meetingText(input.reason,5000,true)!;
    return this.command(id,input,actorId,key,'CANCELLED',PERMISSIONS.MEETING_UPDATE,{reason},async(row,tx)=>{
      if(row.status!=='SCHEDULED')throw new MeetingError('MEETING_STATE_CONFLICT');
      return {row:await this.updateRow(id,{status:'CANCELLED',cancelledAt:this.clock.now(),cancellationReason:reason},tx),changes:{reason,previousStatus:row.status,nextStatus:'CANCELLED'}};
    });
  }
  addParticipant(id:string,input:AddMeetingParticipantDto,actorId:string,key:string) {
    const fields=meetingParticipant(input);
    return this.command(id,input,actorId,key,'PARTICIPANT_ADDED',PERMISSIONS.MEETING_PARTICIPANTS,fields,async(row,tx)=>{
      if(row.status==='CANCELLED')throw new MeetingError('MEETING_STATE_CONFLICT');
      let nameSnapshot=fields.nameSnapshot;
      if(fields.userId) { const user=await this.users.findIdentityById(fields.userId,tx); if(!user?.isActive)throw new MeetingError('MEETING_REFERENCE_UNAVAILABLE'); nameSnapshot=user.givenNames+' '+user.familyNames; }
      if(fields.personId) {
        try { await this.directory.requireReferences({personId:fields.personId,organizationId:null,contactMethodId:null,mediumType:null,mediumValue:null},tx);
          const refs=await this.directory.describeReferences([{personId:fields.personId,organizationId:null,contactMethodId:null}],tx); nameSnapshot??=refs.people.get(fields.personId)!.label;
        } catch(error) { if(error instanceof UnavailableReferralReference)throw new MeetingError('MEETING_REFERENCE_UNAVAILABLE'); throw error; }
      }
      const duplicate=await tx.meetingParticipant.findFirst({where:{meetingId:id,OR:[...(fields.userId?[{userId:fields.userId}]:[]),...(fields.personId?[{personId:fields.personId}]:[])]},select:{id:true}});
      if(duplicate)throw new MeetingError('DUPLICATE_PARTICIPANT');
      const participant=await tx.meetingParticipant.create({data:{...fields,nameSnapshot:nameSnapshot!,meetingId:id,createdByUserId:actorId,createdAt:this.clock.now()}});
      return {row:await this.updateRow(id,{},tx),participantId:participant.id,changes:{participant:{id:participant.id,userId:participant.userId,personId:participant.personId,nameSnapshot:participant.nameSnapshot,organizationSnapshot:participant.organizationSnapshot,roleSnapshot:participant.roleSnapshot,attendance:participant.attendance}}};
    },fields.userId);
  }
  attendance(id:string,participantId:string,input:AttendanceMeetingDto,actorId:string,key:string) {
    if(!['UNKNOWN','ATTENDED','ABSENT'].includes(input.attendance))throw new MeetingError('INVALID_MEETING');
    return this.command(id,input,actorId,key,'ATTENDANCE_RECORDED',PERMISSIONS.MEETING_RESULTS,{participantId,attendance:input.attendance},async(row,tx)=>{
      requireResults(row.status); const participant=await tx.meetingParticipant.findFirst({where:{id:participantId,meetingId:id}});
      if(!participant)throw new MeetingError('MEETING_REFERENCE_UNAVAILABLE');
      await tx.meetingParticipant.update({where:{id:participantId},data:{attendance:input.attendance}});
      return {row:await this.updateRow(id,{},tx),participantId,changes:{participantId,nameSnapshot:participant.nameSnapshot,previous:participant.attendance,next:input.attendance}};
    });
  }
  agreement(id:string,input:AgreementMeetingDto,actorId:string,key:string) {
    const text=meetingText(input.text,5000,true)!;
    return this.command(id,input,actorId,key,'AGREEMENT_ADDED',PERMISSIONS.MEETING_RESULTS,{text},async(row,tx)=>{
      requireResults(row.status); const agreement=await tx.meetingAgreement.create({data:{meetingId:id,text,createdByUserId:actorId,createdAt:this.clock.now()}});
      return {row:await this.updateRow(id,{},tx),agreementId:agreement.id,changes:{agreementId:agreement.id,text}};
    });
  }
  async get(id:string,actorId:string) { return this.prisma.$transaction(async tx=>{const actor=this.authorize(await this.users.findIdentityById(actorId,tx),PERMISSIONS.MEETING_READ),row=await this.row(id,tx); await this.context(row,actor,tx); return this.contract(row);},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead}); }
  async list(query:MeetingQueryDto,actorId:string) {
    return this.prisma.$transaction(async tx=>{
      const actor=this.authorize(await this.users.findIdentityById(actorId,tx),PERMISSIONS.MEETING_READ);
      if(query.processId||query.opportunityId)await this.context({processId:query.processId??null,opportunityId:query.opportunityId??null},actor,tx);
      const where:Prisma.MeetingWhereInput={...(query.processId?{processId:query.processId}:{}),...(query.opportunityId?{opportunityId:query.opportunityId}:{}),...(query.status?{status:query.status}:{}),
        ...(!hasPermission(actor.role,PERMISSIONS.PROCESS_READ)?{processId:null}:{}),...(!hasPermission(actor.role,PERMISSIONS.OPPORTUNITY_READ)?{opportunityId:null}:{})};
      const rows=await tx.meeting.findMany({where,select:meetingSelect,orderBy:[{scheduledAt:'desc'},{id:'desc'}],skip:(query.page-1)*query.pageSize,take:query.pageSize});
      return {items:rows.map(row=>this.contract(row)),total:await tx.meeting.count({where}),page:query.page,pageSize:query.pageSize};
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }
  async internalUsers(query:MeetingUsersQueryDto,actorId:string) { return this.prisma.$transaction(async tx=>{this.authorize(await this.users.findIdentityById(actorId,tx),PERMISSIONS.MEETING_PARTICIPANTS);return this.users.meetingCandidates(query.search?.trim()??'',query.page,query.pageSize,tx);},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead}); }
  async relatedPage(id:string,kind:'participants'|'agreements'|'events',query:MeetingPageQueryDto,actorId:string) {
    return this.prisma.$transaction(async tx=>{
      const actor=this.authorize(await this.users.findIdentityById(actorId,tx),PERMISSIONS.MEETING_READ), row=await this.row(id,tx);await this.context(row,actor,tx);
      const args={where:{meetingId:id},orderBy:[{createdAt:'asc' as const},{id:'asc' as const}],skip:(query.page-1)*query.pageSize,take:query.pageSize};
      if(kind==='events') {const rows=await tx.meetingEvent.findMany({...args,orderBy:{version:'asc'},select:eventSelect});return {items:rows.map(row=>({...row,createdAt:row.createdAt.toISOString(),actor:publicUser(row.actor)})),total:await tx.meetingEvent.count({where:args.where}),page:query.page,pageSize:query.pageSize};}
      if(kind==='agreements') {const rows=await tx.meetingAgreement.findMany({...args,select:{id:true,meetingId:true,text:true,createdAt:true,createdBy:{select:userSelect}}});return {items:rows.map(row=>({...row,createdAt:row.createdAt.toISOString(),createdBy:publicUser(row.createdBy)})),total:await tx.meetingAgreement.count({where:args.where}),page:query.page,pageSize:query.pageSize};}
      const rows=await tx.meetingParticipant.findMany({...args,select:{id:true,meetingId:true,userId:true,personId:true,nameSnapshot:true,organizationSnapshot:true,roleSnapshot:true,attendance:true,createdAt:true,createdBy:{select:userSelect}}});
      return {items:rows.map(row=>({...row,createdAt:row.createdAt.toISOString(),createdBy:publicUser(row.createdBy)})),total:await tx.meetingParticipant.count({where:args.where}),page:query.page,pageSize:query.pageSize};
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }
  async requireAttachmentMeeting(id:string,tx:Prisma.TransactionClient,uploading:boolean,actorId:string) {
    const actor=this.authorize(await this.users.findIdentityById(actorId,tx),PERMISSIONS.MEETING_READ);
    if(uploading)await tx.$queryRaw`SELECT id FROM "Meeting" WHERE id=${id}::uuid FOR UPDATE`;
    const row=await this.row(id,tx);await this.context(row,actor,tx);
    if(uploading&&!canAttachMeeting(row.status))throw new MeetingError('MEETING_STATE_CONFLICT'); return {id:row.id,status:row.status};
  }
  async timelineItems(processId:string,after:TimelinePosition|undefined,limit:number,tx:Prisma.TransactionClient,allowOpportunity:boolean):Promise<TimelineItem[]> {
    const positions=await tx.meetingEvent.findMany({where:{meeting:{processId,...(!allowOpportunity?{opportunityId:null}:{})},...timelineSeek(after,'MEETING','createdAt')},select:{id:true},orderBy:[{createdAt:'asc'},{id:'asc'}],take:limit});
    if(!positions.length)return [];
    const rows=await tx.meetingEvent.findMany({where:{id:{in:positions.map(row=>row.id)}},select:eventSelect,orderBy:[{createdAt:'asc'},{id:'asc'}]});
    return rows.map(row=>({id:row.id,kind:'MEETING_ACTIVITY',occurredAt:row.createdAt.toISOString(),registeredAt:row.createdAt.toISOString(),actor:publicUser(row.actor),summary:'Actuación de reunión',payload:{meetingId:row.meetingId,type:row.type,snapshot:row.snapshot as Record<string,unknown>,changes:row.changes as Record<string,unknown>}}));
  }
  /** Proyección mínima, acotada y sin acuerdos ni identidades externas. */
  notificationSummaries(ids:string[]) {
    if(ids.length>100||ids.some(id=>!isUUID(id)))throw new MeetingError('INVALID_MEETING');
    return this.prisma.meeting.findMany({where:{id:{in:ids}},select:{id:true,scheduledAt:true,timezone:true,purpose:true,processId:true,opportunityId:true}});
  }
  async notificationAudience(ids:string[],tx:Prisma.TransactionClient) {
    if(ids.length>100||ids.some(id=>!isUUID(id)))throw new MeetingError('INVALID_MEETING');
    const meetings=await tx.meeting.findMany({where:{id:{in:ids}},select:{id:true,processId:true,opportunityId:true,participants:{where:{userId:{not:null}},select:{userId:true}}}});
    const formal=await this.processes.notificationParticipants([...new Set(meetings.flatMap(row=>row.processId?[row.processId]:[]))],tx);
    return meetings.map(row=>({id:row.id,processId:row.processId,opportunityId:row.opportunityId,
      userIds:[...new Set([...row.participants.flatMap(p=>p.userId?[p.userId]:[]),...formal.filter(p=>p.processId===row.processId).map(p=>p.userId)])]}));
  }
  /** Hechos confirmados con barrido finito; conserva los dos argumentos originales. */
  recordedActivityUpperBound() {
    return this.prisma.meetingEvent.findFirst({select:{createdAt:true,id:true},orderBy:[{createdAt:'desc'},{id:'desc'}]});
  }
  async recordedActivity(after?:{createdAt:Date;id:string},limit=100,through?:{createdAt:Date;id:string}) {
    if(!Number.isInteger(limit)||limit<1||limit>100||[after,through].some(cursor=>cursor&&(!isUUID(cursor.id)||!Number.isFinite(+cursor.createdAt))))throw new MeetingError('INVALID_MEETING');
    const rows=await this.prisma.meetingEvent.findMany({where:{AND:[
      ...(after?[{OR:[{createdAt:{gt:after.createdAt}},{createdAt:after.createdAt,id:{gt:after.id}}]}]:[]),
      ...(through?[{OR:[{createdAt:{lt:through.createdAt}},{createdAt:through.createdAt,id:{lte:through.id}}]}]:[]),
    ]},select:{id:true,meetingId:true,type:true,createdAt:true,actorUserId:true,changes:true,participant:{select:{userId:true}}},orderBy:[{createdAt:'asc'},{id:'asc'}],take:limit+1});
    const items=rows.slice(0,limit),last=items.at(-1);return {items:items.map(row=>({id:row.id,meetingId:row.meetingId,type:row.type,createdAt:row.createdAt,
      actorUserId:row.actorUserId,changes:row.type==='UPDATED'?row.changes:{},internalUserId:row.participant?.userId??null})),next:rows.length>limit&&last?{createdAt:last.createdAt,id:last.id}:null};
  }
}
