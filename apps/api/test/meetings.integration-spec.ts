import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { Prisma, UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { RelationshipProcessesService } from '../src/modules/relationships/relationship-processes.service';
import { OpportunitiesService } from '../src/modules/opportunities/opportunities.service';
import { MeetingsService } from '../src/modules/meetings/meetings.service';
import { MeetingClock } from '../src/modules/meetings/meeting-clock';
import { AuditService } from '../src/modules/audit/audit.service';
import { FilesService } from '../src/modules/files/files.service';
import { FileStorage } from '../src/modules/files/file-storage';
import * as permissions from '../src/modules/auth/authorization/role-permissions';
import { PERMISSIONS } from '../src/modules/auth/authorization/permission';
import type { MeetingDto } from '../src/modules/meetings/meeting.dto';
const databaseUrl=validateDatabaseUrl(process.env.DATABASE_URL);
if(!new URL(databaseUrl).pathname.endsWith('_test'))throw new Error('Reuniones requieren base aislada _test.');
describe('Reuniones PostgreSQL/HTTP y archivos privados',()=>{
 let app:INestApplication<Server>,prisma:PrismaService,service:MeetingsService,root:string;
 const users:string[]=[],orgs:string[]=[],people:string[]=[];
 beforeAll(async()=>{
  root=await mkdtemp(join(tmpdir(),'cecasem-meetings-integration-'));
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(ConfigService).useValue(new ConfigService(validateEnvironment({NODE_ENV:'test',DATABASE_URL:databaseUrl,FILE_STORAGE_ROOT:root}))).compile();
  app=module.createNestApplication<INestApplication<Server>>();configureApplication(app);await app.init();prisma=app.get(PrismaService);service=app.get(MeetingsService);
 });
 afterEach(async()=>{
  jest.restoreAllMocks();
  await prisma.$transaction([
   prisma.auditEvent.deleteMany({where:{actorUserId:{in:users}}}),
   prisma.fileAttachment.deleteMany({where:{upload:{uploadedByUserId:{in:users}}}}),prisma.fileUpload.deleteMany({where:{uploadedByUserId:{in:users}}}),
   prisma.meetingEvent.deleteMany({where:{meeting:{createdByUserId:{in:users}}}}),prisma.meetingAgreement.deleteMany({where:{meeting:{createdByUserId:{in:users}}}}),prisma.meetingParticipant.deleteMany({where:{meeting:{createdByUserId:{in:users}}}}),prisma.meeting.deleteMany({where:{createdByUserId:{in:users}}}),
   prisma.opportunityEvent.deleteMany({where:{actorUserId:{in:users}}}),prisma.opportunityOrganization.deleteMany({where:{organizationId:{in:orgs}}}),prisma.opportunity.deleteMany({where:{createdByUserId:{in:users}}}),
   prisma.relationshipProcessEvent.deleteMany({where:{actorUserId:{in:users}}}),prisma.processParticipant.deleteMany({where:{process:{createdByUserId:{in:users}}}}),prisma.relationshipProcess.deleteMany({where:{createdByUserId:{in:users}}}),
   prisma.person.deleteMany({where:{id:{in:people}}}),prisma.organization.deleteMany({where:{id:{in:orgs}}}),
   prisma.userSession.deleteMany({where:{userId:{in:users}}}),prisma.user.deleteMany({where:{id:{in:users}}})
  ]);users.length=orgs.length=people.length=0;
  await rm(join(root,'objects'),{recursive:true,force:true});await rm(join(root,'staging'),{recursive:true,force:true});
 });
 afterAll(async()=>{await app.close();await rm(root,{recursive:true,force:true});});
 async function actor(role:UserRole=UserRole.RESEARCH){const user=await app.get(UsersService).createIdentity({givenNames:'QA',familyNames:'Reuniones',role,email:randomUUID()+'@example.test'});users.push(user.id);const token=await prisma.$transaction(tx=>app.get(SessionsService).create(user.id,tx));return {...user,cookie:'cecasem_session='+token};}
 async function fixture(){const owner=await actor(UserRole.ADMINISTRATOR),writer=await actor(),org=await prisma.organization.create({data:{name:'Fundación QA '+randomUUID()}});orgs.push(org.id);const process=await app.get(RelationshipProcessesService).create({organizationId:org.id,purpose:'Cooperación institucional'},owner.id);return {owner,writer,org,process};}
 const future={scheduledLocal:'2099-10-15T10:00',timezone:'America/La_Paz',modality:'ONLINE' as const,purpose:'Planificación institucional'};
 const past={...future,scheduledLocal:'2000-01-15T10:00'};
 function post(cookie:string,route='meetings',body:object=future,key=randomUUID()){return request(app.getHttpServer()).post('/api/v1/'+route).set('Cookie',cookie).set('Idempotency-Key',key).send(body);}
 function patch(cookie:string,route:string,body:object,key=randomUUID()){return request(app.getHttpServer()).patch('/api/v1/'+route).set('Cookie',cookie).set('Idempotency-Key',key).send(body);}
 async function create(f:Awaited<ReturnType<typeof fixture>>,historical=false){return service.create({...historical?past:future,processId:f.process.id},f.writer.id,randomUUID());}
 function upload(cookie:string,id:string,key=randomUUID()){return request(app.getHttpServer()).post('/api/v1/meetings/'+id+'/attachments').set('Cookie',cookie).set('Idempotency-Key',key).attach('files',Buffer.from('Documentación institucional'),{filename:'acuerdo.txt',contentType:'text/plain'});}
 it.each(Object.values(UserRole))('%s consulta, planifica, registra resultados y adjunta documentación',async role=>{
  const f=await fixture(),user=await actor(role);
  const created=await post(user.cookie,'meetings',{...future,processId:f.process.id}).expect(201),meeting=created.body as MeetingDto;
  await request(app.getHttpServer()).get('/api/v1/meetings/'+meeting.id).set('Cookie',f.writer.cookie).expect(200).expect('Cache-Control','no-store');
  const changed=await patch(user.cookie,'meetings/'+meeting.id,{...future,purpose:'Propósito actualizado',expectedVersion:1}).expect(200);expect((changed.body as MeetingDto).version).toBe(2);
  await post(user.cookie,'meetings/'+meeting.id+'/participants',{userId:f.owner.id,expectedVersion:2}).expect(201);
  await upload(user.cookie,meeting.id).expect(201);
  const historic=await service.create({...past,processId:f.process.id},user.id,randomUUID());
  const completed=await post(user.cookie,'meetings/'+historic.id+'/complete',{expectedVersion:historic.version}).expect(201);
  const added=await post(user.cookie,'meetings/'+historic.id+'/participants',{nameSnapshot:'María sin ficha',expectedVersion:(completed.body as MeetingDto).version}).expect(201);
  const participant=await prisma.meetingParticipant.findFirstOrThrow({where:{meetingId:historic.id}});
  const attendance=await patch(user.cookie,'meetings/'+historic.id+'/participants/'+participant.id+'/attendance',{attendance:'ATTENDED',expectedVersion:(added.body as MeetingDto).version}).expect(200);
  await post(user.cookie,'meetings/'+historic.id+'/agreements',{text:'Acuerdo institucional',expectedVersion:(attendance.body as MeetingDto).version}).expect(201);
  await upload(user.cookie,historic.id).expect(201);
 });
 it('programación futura otorga participación formal sin actualizar actividad ni estados',async()=>{
  const f=await fixture(),before=await prisma.relationshipProcess.findUniqueOrThrow({where:{id:f.process.id}}),row=await create(f);
  const participant=await prisma.processParticipant.findUniqueOrThrow({where:{processId_userId:{processId:f.process.id,userId:f.writer.id}}});
  expect(participant.origin).toBe('MEETING_CREATED');expect(await prisma.relationshipProcess.findUniqueOrThrow({where:{id:f.process.id}})).toEqual(before);
  await service.get(row.id,f.owner.id);expect(await prisma.relationshipProcess.findUniqueOrThrow({where:{id:f.process.id}})).toEqual(before);
 });
 it('misma key concurrente crea una sola reunión, evento, auditoría y participación',async()=>{
  const f=await fixture(),key=randomUUID(),input={...future,processId:f.process.id};
  const [a,b]=await Promise.all([service.create(input,f.writer.id,key),service.create(input,f.writer.id,key)]);expect(a.id).toBe(b.id);
  expect(await prisma.meeting.count({where:{createdByUserId:f.writer.id}})).toBe(1);expect(await prisma.meetingEvent.count({where:{meetingId:a.id}})).toBe(1);expect(await prisma.auditEvent.count({where:{meetingEvent:{meetingId:a.id}}})).toBe(1);
  await expect(service.create({...input,purpose:'Distinto'},f.writer.id,key)).rejects.toMatchObject({code:'REQUEST_CONFLICT'});
 });
 it('rollback de auditoría revierte reunión, eventos y participación',async()=>{
  const f=await fixture();jest.spyOn(app.get(AuditService),'recordMeeting').mockRejectedValueOnce(new Error('Fallo deliberado'));
  await expect(create(f)).rejects.toThrow('Fallo deliberado');expect(await prisma.meeting.count({where:{processId:f.process.id}})).toBe(0);expect(await prisma.processParticipant.count({where:{processId:f.process.id,userId:f.writer.id}})).toBe(0);
 });
 it('oportunidad sola y vínculos coherentes conservan su estado',async()=>{
  const f=await fixture(),opportunity=await app.get(OpportunitiesService).create({name:'Convocatoria',processId:f.process.id,organizationIds:[f.org.id]},f.owner.id,randomUUID()),before=await prisma.opportunity.findUniqueOrThrow({where:{id:opportunity.id}});
  const solo=await service.create({...future,opportunityId:opportunity.id},f.writer.id,randomUUID());expect(solo.processId).toBeNull();
  await service.create({...future,processId:f.process.id,opportunityId:opportunity.id},f.writer.id,randomUUID());expect(await prisma.opportunity.findUniqueOrThrow({where:{id:opportunity.id}})).toEqual(before);
  const other=await app.get(RelationshipProcessesService).create({organizationId:f.org.id,purpose:'Otro proceso'},f.owner.id);
  await post(f.writer.cookie,'meetings',{...future,processId:other.id,opportunityId:opportunity.id}).expect(400);
  await expect(prisma.meeting.create({data:{scheduledAt:new Date('2099-10-15T14:00Z'),timezone:future.timezone,modality:'ONLINE',purpose:'Incoherente',processId:other.id,opportunityId:opportunity.id,createdByUserId:f.writer.id,requestKey:randomUUID(),requestFingerprint:'a'.repeat(64)}})).rejects.toThrow();
 });
 it('registra usuarios y personas reales, conserva snapshots y no inventa ficha externa',async()=>{
  const f=await fixture();let row=await create(f);const p=await prisma.person.create({data:{displayName:'María identificada'}});people.push(p.id);
  row=await service.addParticipant(row.id,{userId:f.owner.id,nameSnapshot:'No debe suplantar identidad',expectedVersion:row.version},f.writer.id,randomUUID());
  row=await service.addParticipant(row.id,{personId:p.id,organizationSnapshot:'Fundación X',expectedVersion:row.version},f.writer.id,randomUUID());
  row=await service.addParticipant(row.id,{nameSnapshot:'Juan del área',expectedVersion:row.version},f.writer.id,randomUUID());
  const before=await prisma.meetingParticipant.findMany({where:{meetingId:row.id}});
  expect(before.find(p=>p.userId===f.owner.id)?.nameSnapshot).toBe('QA Reuniones');expect(before.find(p=>p.personId)?.nameSnapshot).toBe('María identificada');
  await prisma.person.update({where:{id:p.id},data:{displayName:'Nombre corregido',isActive:false}});
  expect(await prisma.meetingParticipant.findMany({where:{meetingId:row.id}})).toEqual(before);expect(await prisma.person.count({where:{id:{in:people}}})).toBe(1);
  await expect(service.addParticipant(row.id,{userId:f.owner.id,expectedVersion:row.version},f.writer.id,randomUUID())).rejects.toMatchObject({code:'DUPLICATE_PARTICIPANT'});
  await expect(prisma.meetingParticipant.create({data:{meetingId:row.id,userId:f.owner.id,nameSnapshot:'Duplicado',createdByUserId:f.writer.id}})).rejects.toThrow();
 });
 it('reprogramación concurrente usa versión y conserva antes/después',async()=>{
  const f=await fixture(),row=await create(f),a=await actor(UserRole.PLANNING);
  const outcomes=await Promise.allSettled([service.update(row.id,{...future,purpose:'Plan A',expectedVersion:1},f.writer.id,randomUUID()),service.update(row.id,{...future,purpose:'Plan B',expectedVersion:1},a.id,randomUUID())]);
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(outcomes.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'VERSION_CONFLICT'}});
  const event=await prisma.meetingEvent.findFirstOrThrow({where:{meetingId:row.id,type:'UPDATED'}});expect(event.changes).toMatchObject({previous:{purpose:future.purpose}});
 });
 it('no permite completar futuro ni editar planificación pasada o consolidada',async()=>{
  const f=await fixture(),row=await create(f);await expect(service.complete(row.id,{expectedVersion:1},f.writer.id,randomUUID())).rejects.toMatchObject({code:'MEETING_STATE_CONFLICT'});
  const historic=await create(f,true);await expect(service.update(historic.id,{...future,expectedVersion:1},f.writer.id,randomUUID())).rejects.toMatchObject({code:'MEETING_STATE_CONFLICT'});
  const done=await service.complete(historic.id,{expectedVersion:1},f.writer.id,randomUUID());await expect(service.update(done.id,{...future,expectedVersion:done.version},f.writer.id,randomUUID())).rejects.toMatchObject({code:'MEETING_STATE_CONFLICT'});
 });
 it('completar/cancelar concurrente consolida un solo resultado',async()=>{
  const f=await fixture(),row=await create(f,true),other=await actor();
  const outcomes=await Promise.allSettled([service.complete(row.id,{expectedVersion:1},f.writer.id,randomUUID()),service.cancel(row.id,{expectedVersion:1,reason:'Cambio institucional'},other.id,randomUUID())]);
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(outcomes.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'VERSION_CONFLICT'}});
 });
 it('participante concurrente no duplica invitado interno',async()=>{
  const f=await fixture(),row=await create(f),other=await actor();
  const results=await Promise.allSettled([service.addParticipant(row.id,{userId:f.owner.id,expectedVersion:1},f.writer.id,randomUUID()),service.addParticipant(row.id,{userId:f.owner.id,expectedVersion:1},other.id,randomUUID())]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await prisma.meetingParticipant.count({where:{meetingId:row.id}})).toBe(1);
 });
 async function completed(){const f=await fixture();let row=await create(f,true);row=await service.addParticipant(row.id,{nameSnapshot:'Invitada textual',expectedVersion:row.version},f.writer.id,randomUUID());row=await service.complete(row.id,{expectedVersion:row.version},f.writer.id,randomUUID());const participant=await prisma.meetingParticipant.findFirstOrThrow({where:{meetingId:row.id}});return {f,row,participant};}
 it('asistencia concurrente conserva el cambio confirmado y rechaza versión anterior',async()=>{
  const {f,row,participant}=await completed(),other=await actor();
  const results=await Promise.allSettled([service.attendance(row.id,participant.id,{attendance:'ATTENDED',expectedVersion:row.version},f.writer.id,randomUUID()),service.attendance(row.id,participant.id,{attendance:'ABSENT',expectedVersion:row.version},other.id,randomUUID())]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await prisma.meetingEvent.count({where:{meetingId:row.id,type:'ATTENDANCE_RECORDED'}})).toBe(1);
 });
 it('acuerdo concurrente/retry es append-only y atómico',async()=>{
  const {f,row}=await completed(),key=randomUUID(),input={text:'Acuerdo original',expectedVersion:row.version};
  const results=await Promise.all([service.agreement(row.id,input,f.writer.id,key),service.agreement(row.id,input,f.writer.id,key)]);expect(results[0].version).toBe(results[1].version);expect(await prisma.meetingAgreement.count({where:{meetingId:row.id}})).toBe(1);
  const agreement=await prisma.meetingAgreement.findFirstOrThrow({where:{meetingId:row.id}});await expect(prisma.meetingAgreement.update({where:{id:agreement.id},data:{text:'Reemplazo'}})).rejects.toThrow();
  const added=await service.agreement(row.id,{text:'Aclaración posterior',expectedVersion:results[0].version},f.owner.id,randomUUID());expect(added.agreementCount).toBe(2);
  jest.spyOn(app.get(AuditService),'recordMeeting').mockRejectedValueOnce(new Error('Rollback resultado'));await expect(service.agreement(row.id,{text:'No confirma',expectedVersion:added.version},f.owner.id,randomUUID())).rejects.toThrow('Rollback resultado');expect(await prisma.meetingAgreement.count({where:{meetingId:row.id}})).toBe(2);
 });
 it('realización, asistentes posteriores y acuerdos registran actividad monotónica',async()=>{
  const f=await fixture();let row=await create(f);const original=await prisma.relationshipProcess.findUniqueOrThrow({where:{id:f.process.id}});
  jest.spyOn(app.get(MeetingClock),'now').mockReturnValue(new Date('2099-10-16T14:00:00Z'));
  row=await service.complete(row.id,{expectedVersion:row.version},f.writer.id,randomUUID());const after=await prisma.relationshipProcess.findUniqueOrThrow({where:{id:f.process.id}});
  expect(after.lastActivityAt.toISOString()).toBe('2099-10-16T14:00:00.000Z');expect(after.version).toBe(original.version+1);expect(after.state).toBe(original.state);
  const other=await actor(UserRole.PLANNING);row=await service.addParticipant(row.id,{nameSnapshot:'Asistió sin invitación',expectedVersion:row.version},other.id,randomUUID());
  await service.agreement(row.id,{text:'Continuar colaboración',expectedVersion:row.version},other.id,randomUUID());
  expect(await prisma.processParticipant.count({where:{processId:f.process.id,userId:other.id}})).toBe(1);expect((await prisma.relationshipProcess.findUniqueOrThrow({where:{id:f.process.id}})).version).toBe(after.version+2);
 });
 it('archivos conservan privacidad, hashes y retry después de cancelar',async()=>{
  const f=await fixture(),row=await create(f),key=randomUUID(),response=await upload(f.writer.cookie,row.id,key).expect(201),file=(response.body as {id:string;meetingId:string;sha256:string}[])[0];
  expect(file.meetingId).toBe(row.id);expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
  await service.cancel(row.id,{expectedVersion:1,reason:'Cancelación con documentación'},f.owner.id,randomUUID());
  await upload(f.writer.cookie,row.id).expect(409);const retry=await upload(f.writer.cookie,row.id,key).expect(201);expect((retry.body as {id:string}[])[0].id).toBe(file.id);
  await request(app.getHttpServer()).get('/api/v1/files/'+file.id+'/download').expect(401);
  await request(app.getHttpServer()).get('/api/v1/files/'+file.id+'/download').set('Cookie',f.owner.cookie).expect(200).expect('Cache-Control','private, no-store');
 });
 it('completed permite documentación posterior; fallo de auditoría compensa storage',async()=>{
  const {f,row}=await completed();await upload(f.writer.cookie,row.id).expect(201);const before=await prisma.fileAttachment.count({where:{upload:{meetingId:row.id}}});
  jest.spyOn(app.get(AuditService),'recordFilesAttached').mockRejectedValueOnce(new Error('Fallo archivos'));await upload(f.writer.cookie,row.id).expect(500);expect(await prisma.fileAttachment.count({where:{upload:{meetingId:row.id}}})).toBe(before);
 });
 function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
 async function blocked(change:(tx:Prisma.TransactionClient)=>Promise<unknown>,operation:()=>Promise<unknown>){const entered=deferred(),release=deferred();const changing=prisma.$transaction(async tx=>{await change(tx);entered.resolve();await release.promise;});await entered.promise;const result=operation();release.resolve();await changing;return result;}
 it('usuario desactivado concurrentemente se revalida',async()=>{const f=await fixture();const result=await blocked(tx=>tx.user.update({where:{id:f.writer.id},data:{isActive:false,deactivatedAt:new Date()}}),()=>create(f).catch(error=>error as unknown));expect(result).toMatchObject({code:'FORBIDDEN'});});
 it('cambio concurrente de oportunidad se revalida y su origen histórico no se reescribe',async()=>{
  const f=await fixture(),opportunity=await app.get(OpportunitiesService).create({name:'Independiente',organizationIds:[f.org.id]},f.owner.id,randomUUID());
  await expect(prisma.opportunity.update({where:{id:opportunity.id},data:{processId:f.process.id}})).rejects.toThrow();
  const result=await blocked(tx=>tx.opportunity.update({where:{id:opportunity.id},data:{name:'Nombre confirmado'}}),()=>service.create({...future,processId:f.process.id,opportunityId:opportunity.id},f.writer.id,randomUUID()));expect(result).toMatchObject({opportunity:{name:'Nombre confirmado'},processId:f.process.id});
 });
 it('cancelación concurrente contra carga revalida estado y compensa bytes',async()=>{
  const f=await fixture(),row=await create(f),files=app.get(FilesService),storage=app.get(FileStorage),staged=await storage.stage((await import('node:stream')).Readable.from(Buffer.from('Archivo QA')));
  const result=await blocked(async tx=>{await tx.$queryRaw`SELECT id FROM "Meeting" WHERE id=${row.id}::uuid FOR UPDATE`;await tx.meeting.update({where:{id:row.id},data:{status:'CANCELLED',cancelledAt:new Date(),cancellationReason:'Cancelación concurrente'}});},()=>files.upload({meetingId:row.id},[{...staged,originalname:'qa.txt',mimetype:'text/plain'}],f.writer.id,randomUUID()).catch(error=>error as unknown));
  expect(result).toMatchObject({code:'MEETING_CANCELLED'});expect(await prisma.fileUpload.count({where:{meetingId:row.id}})).toBe(0);
 });
 it('completado concurrente contra carga admite documentación posterior',async()=>{
  const f=await fixture(),row=await create(f,true),files=app.get(FilesService),storage=app.get(FileStorage),staged=await storage.stage((await import('node:stream')).Readable.from(Buffer.from('Archivo QA')));
  const result=await blocked(async tx=>{await tx.$queryRaw`SELECT id FROM "Meeting" WHERE id=${row.id}::uuid FOR UPDATE`;await tx.meeting.update({where:{id:row.id},data:{status:'COMPLETED',completedAt:new Date()}});},()=>files.upload({meetingId:row.id},[{...staged,originalname:'qa.txt',mimetype:'text/plain'}],f.writer.id,randomUUID()));
  expect(result).toHaveLength(1);
 });
 it.each([PERMISSIONS.MEETING_CREATE,PERMISSIONS.PROCESS_READ,PERMISSIONS.OPPORTUNITY_READ])('backend rechaza capability ausente %s',async permission=>{
  const f=await fixture(),opportunity=await app.get(OpportunitiesService).create({name:'Contexto',processId:f.process.id,organizationIds:[f.org.id]},f.owner.id,randomUUID()),original=permissions.hasPermission;
  jest.spyOn(permissions,'hasPermission').mockImplementation((role,value)=>value!==permission&&original(role,value));
  await post(f.writer.cookie,'meetings',{...future,processId:f.process.id,opportunityId:opportunity.id}).expect(403);
 });
 it.each([PERMISSIONS.MEETING_READ,PERMISSIONS.OPPORTUNITY_READ])('timeline no expone reuniones o archivos sin contexto autorizado %s',async permission=>{
  const f=await fixture(),opportunity=await app.get(OpportunitiesService).create({name:'Contexto privado',processId:f.process.id,organizationIds:[f.org.id]},f.owner.id,randomUUID());
  const row=await service.create({...future,processId:f.process.id,opportunityId:opportunity.id},f.writer.id,randomUUID());
  const uploaded=await upload(f.writer.cookie,row.id).expect(201),file=(uploaded.body as {id:string}[])[0],original=permissions.hasPermission;
  jest.spyOn(permissions,'hasPermission').mockImplementation((role,value)=>value!==permission&&original(role,value));
  await request(app.getHttpServer()).get('/api/v1/meetings/'+row.id).set('Cookie',f.writer.cookie).expect(403);
  await request(app.getHttpServer()).get('/api/v1/files/'+file.id+'/download').set('Cookie',f.writer.cookie).expect(403);
  const response=await request(app.getHttpServer()).get('/api/v1/relationship-processes/'+f.process.id+'/timeline').set('Cookie',f.writer.cookie).expect(200);
  const timeline=response.body as {items:{kind:string;payload:{meetingId?:string}}[]};expect(timeline.items.some(item=>item.kind==='MEETING_ACTIVITY'||item.payload.meetingId===row.id)).toBe(false);
 });
 it('401, sesión revocada, usuario inactivo y UUID inexistente',async()=>{
  const f=await fixture();await request(app.getHttpServer()).get('/api/v1/meetings').expect(401);
  await request(app.getHttpServer()).get('/api/v1/meetings/'+randomUUID()).set('Cookie',f.writer.cookie).expect(404);
  await prisma.userSession.updateMany({where:{userId:f.writer.id},data:{revokedAt:new Date()}});await request(app.getHttpServer()).get('/api/v1/meetings').set('Cookie',f.writer.cookie).expect(401);
  await prisma.user.update({where:{id:f.owner.id},data:{isActive:false,deactivatedAt:new Date()}});await request(app.getHttpServer()).get('/api/v1/meetings').set('Cookie',f.owner.cookie).expect(401);
 });
 it('cierre concurrente del proceso conserva el cierre y permite la actuación sin reapertura',async()=>{
  const f=await fixture();
  await Promise.all([app.get(RelationshipProcessesService).close(f.process.id,{expectedVersion:1,result:'ACHIEVED'},f.owner.id),create(f)]);
  const process=await prisma.relationshipProcess.findUniqueOrThrow({where:{id:f.process.id}});expect(process.state).toBe('CLOSED');expect(process.version).toBe(2);expect(await prisma.meeting.count({where:{processId:f.process.id}})).toBe(1);
 });
 it('acuerdos distintos concurrentes requieren revisar la versión confirmada',async()=>{
  const {f,row}=await completed(),other=await actor();
  const outcomes=await Promise.allSettled([service.agreement(row.id,{text:'Acuerdo A',expectedVersion:row.version},f.writer.id,randomUUID()),service.agreement(row.id,{text:'Acuerdo B',expectedVersion:row.version},other.id,randomUUID())]);
  expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(outcomes.find(result=>result.status==='rejected')).toMatchObject({reason:{code:'VERSION_CONFLICT'}});expect(await prisma.meetingAgreement.count({where:{meetingId:row.id}})).toBe(1);
 });
 it('asistencia previa, participante de otra reunión y acuerdo previo se rechazan',async()=>{
  const f=await fixture(),row=await create(f);await expect(service.agreement(row.id,{text:'Aún no ocurrió',expectedVersion:1},f.writer.id,randomUUID())).rejects.toMatchObject({code:'MEETING_STATE_CONFLICT'});
  await expect(service.attendance(row.id,randomUUID(),{attendance:'ATTENDED',expectedVersion:1},f.writer.id,randomUUID())).rejects.toMatchObject({code:'MEETING_STATE_CONFLICT'});
  const done=await completed();await expect(service.attendance(done.row.id,randomUUID(),{attendance:'ATTENDED',expectedVersion:done.row.version},done.f.writer.id,randomUUID())).rejects.toMatchObject({code:'MEETING_REFERENCE_UNAVAILABLE'});
 });
 it('rechaza origen, formato, timezone, DST y campos no permitidos',async()=>{
  const f=await fixture();
  for(const input of [future,{...future,processId:randomUUID()},{...future,processId:f.process.id,timezone:'Inventada/Zona'},{...future,processId:f.process.id,scheduledLocal:'2026-03-08T02:30',timezone:'America/New_York'},{...future,processId:f.process.id,scheduledLocal:'2026-11-01T01:30',timezone:'America/New_York'},{...future,processId:f.process.id,createdByUserId:f.owner.id}])await post(f.writer.cookie,'meetings',input).expect(400);
 });
 it('FKs, CHECKs, auditoría y triggers protegen historia',async()=>{
  const f=await fixture(),row=await create(f),event=await prisma.meetingEvent.findFirstOrThrow({where:{meetingId:row.id}});
  await expect(prisma.meeting.update({where:{id:row.id},data:{processId:null}})).rejects.toThrow();
  await expect(prisma.meeting.update({where:{id:row.id},data:{status:'COMPLETED'}})).rejects.toThrow();
  await expect(prisma.meetingEvent.update({where:{id:event.id},data:{changes:{text:'Sobrescrito'}}})).rejects.toThrow();
  await expect(prisma.auditEvent.create({data:{action:'MEETING_RECORDED',actorUserId:f.owner.id,meetingEventId:event.id,operationId:event.id}})).rejects.toThrow();
  await expect(prisma.meetingParticipant.create({data:{meetingId:randomUUID(),nameSnapshot:'No existe',createdByUserId:f.writer.id}})).rejects.toThrow();
 });
 it('timeline y listados paginan con cursores estables sin N+1',async()=>{
  const f=await fixture(),row=await create(f);await service.addParticipant(row.id,{nameSnapshot:'Nombre mencionado',expectedVersion:1},f.writer.id,randomUUID());
  const ids:string[]=[];let after:string|null=null;
  do {const response=await request(app.getHttpServer()).get('/api/v1/relationship-processes/'+f.process.id+'/timeline?pageSize=1'+(after?'&after='+after:'')).set('Cookie',f.writer.cookie).expect(200);const page=response.body as {items:{id:string;kind:string}[];nextCursor:string|null};ids.push(...page.items.filter(item=>item.kind==='MEETING_ACTIVITY').map(item=>item.id));after=page.nextCursor;}while(after);
  expect(ids).toHaveLength(2);expect(new Set(ids).size).toBe(2);
  const spy=jest.spyOn(Client.prototype,'query'),queryText=(v:unknown)=>typeof v==='string'?v:v&&typeof v==='object'&&'text'in v?String(v.text):'',count=()=>spy.mock.calls.filter(([v])=>/^SELECT/i.test(queryText(v))).length;
  await service.list({page:1,pageSize:25,processId:f.process.id},f.writer.id);const baseline=count();
  await prisma.meeting.createMany({data:Array.from({length:999},()=>({scheduledAt:new Date('2099-10-15T14:00Z'),timezone:future.timezone,modality:'ONLINE' as const,purpose:'Carga institucional',processId:f.process.id,createdByUserId:f.writer.id,requestKey:randomUUID(),requestFingerprint:'a'.repeat(64)}))});
  spy.mockClear();const page=await service.list({page:1,pageSize:25,processId:f.process.id},f.writer.id);expect(page.total).toBe(1000);expect(page.items).toHaveLength(25);expect(count()).toBe(baseline);
  const activity=await service.recordedActivity(undefined,1);expect(activity.items).toHaveLength(1);expect(activity.next).not.toBeNull();
 });
});
