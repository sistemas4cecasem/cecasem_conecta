import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger, type INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { UsersService } from '../src/modules/users/users.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { ContactIntentsService } from '../src/modules/relationships/contact-intents.service';
import { RelationshipProcessesService } from '../src/modules/relationships/relationship-processes.service';
import { InactivitySourcesService } from '../src/modules/relationships/inactivity-sources.service';
import { ContactRestrictionsService } from '../src/modules/relationships/contact-restrictions.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { ReminderScheduler } from '../src/modules/reminders/reminder-scheduler';
import { ReminderSettingsService } from '../src/modules/settings/reminder-settings.service';
import { UserRole } from '../src/generated/prisma/client';
import { MeetingsService } from '../src/modules/meetings/meetings.service';
import { InternalNotesService } from '../src/modules/relationships/internal-notes.service';
import { AuditService } from '../src/modules/audit/audit.service';
import type { NotificationDto } from '../src/modules/notifications/notification.dto';

const databaseUrl=validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Recordatorios requieren base aislada _test.');
const days=86400000;
describe('4.6 recordatorios PostgreSQL/HTTP',()=>{
  let app:INestApplication<Server>,prisma:PrismaService,scheduler:ReminderScheduler,processes:RelationshipProcessesService,
    intents:ContactIntentsService,settings:ReminderSettingsService,notifications:NotificationsService;
  const users:string[]=[],orgs:string[]=[];
  beforeAll(async()=>{
    const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({NODE_ENV:'test',DATABASE_URL:databaseUrl}))).compile();
    app=module.createNestApplication<INestApplication<Server>>();configureApplication(app);await app.init();
    prisma=app.get(PrismaService);scheduler=app.get(ReminderScheduler);processes=app.get(RelationshipProcessesService);
    intents=app.get(ContactIntentsService);settings=app.get(ReminderSettingsService);notifications=app.get(NotificationsService);
  });
  afterEach(async()=>{
    jest.restoreAllMocks();
    await prisma.$transaction([
      prisma.notification.deleteMany({where:{recipientUserId:{in:users}}}),
      prisma.reminderOccurrence.deleteMany({where:{OR:[{intent:{authorUserId:{in:users}}},{process:{createdByUserId:{in:users}}}]}}),
      prisma.auditEvent.deleteMany({where:{actorUserId:{in:users}}}),
      prisma.meetingEvent.deleteMany({where:{actorUserId:{in:users}}}),
      prisma.meetingParticipant.deleteMany({where:{createdByUserId:{in:users}}}),
      prisma.meeting.deleteMany({where:{createdByUserId:{in:users}}}),
      prisma.internalNote.deleteMany({where:{process:{createdByUserId:{in:users}}}}),
      prisma.contactRestriction.deleteMany({where:{registeredByUserId:{in:users}}}),
      prisma.relationshipProcessEvent.deleteMany({where:{actorUserId:{in:users}}}),
      prisma.processParticipant.deleteMany({where:{process:{createdByUserId:{in:users}}}}),
      prisma.relationshipProcess.deleteMany({where:{createdByUserId:{in:users}}}),
      prisma.contactIntent.deleteMany({where:{authorUserId:{in:users}}}),
      prisma.organization.deleteMany({where:{id:{in:orgs}}}),
      prisma.userSession.deleteMany({where:{userId:{in:users}}}),prisma.user.deleteMany({where:{id:{in:users}}}),
      prisma.reminderSettings.update({where:{id:1},data:{intervalDays:7,version:1}}),
    ]);users.length=orgs.length=0;
  });
  afterAll(async()=>app.close());
  async function actor(role:UserRole=UserRole.RESEARCH){
    const user=await app.get(UsersService).createIdentity({givenNames:'QA',familyNames:randomUUID().slice(0,8),email:randomUUID()+'@example.test',role});users.push(user.id);
    const token=await prisma.$transaction(tx=>app.get(SessionsService).create(user.id,tx));return {...user,cookie:'cecasem_session='+token};
  }
  async function fixture(kind:'intent'|'process'='process'){
    const owner=await actor(),outsider=await actor(),admin=await actor(UserRole.ADMINISTRATOR);
    const org=await prisma.organization.create({data:{name:'Institución seguimiento '+randomUUID()}});orgs.push(org.id);
    const input={organizationId:org.id,purpose:'Seguimiento institucional'};
    const resource=kind==='intent'?await intents.create(input,owner.id):await processes.create(input,owner.id);
    const anchor=new Date(resource.lastActivityAt),now=new Date(+anchor+8*days);
    return {owner,outsider,admin,org,resource,anchor,now};
  }
  async function occurrences(id:string){return prisma.reminderOccurrence.findMany({where:{OR:[{intentId:id},{processId:id}]},orderBy:{createdAt:'asc'}});}
  it.each(['intent','process'] as const)('detecta %s una vez, no modifica estado/actividad y lectura es privada',async kind=>{
    const f=await fixture(kind);const before=kind==='intent'?await prisma.contactIntent.findUniqueOrThrow({where:{id:f.resource.id}}):await prisma.relationshipProcess.findUniqueOrThrow({where:{id:f.resource.id}});
    expect((await scheduler.sweep(new Date(+f.anchor+7*days-1))).detected).toBe(0);
    expect((await scheduler.sweep(new Date(+f.anchor+7*days))).detected).toBe(1);
    await scheduler.sweep(f.now);await scheduler.sweep(new Date(+f.now+days));
    const [occurrence]=await occurrences(f.resource.id);expect(await occurrences(f.resource.id)).toHaveLength(1);expect(occurrence.intervalDaysSnapshot).toBe(7);
    const rows=await prisma.notification.findMany({where:{reminderId:occurrence.id}});expect(rows.map(row=>row.recipientUserId)).toEqual([f.owner.id]);
    expect(await notifications.unreadCount(f.admin.id)).toEqual({count:0});expect(await notifications.unreadCount(f.outsider.id)).toEqual({count:0});
    const server=app.getHttpServer();await request(server).get('/api/v1/me/notifications').expect(401);
    await request(server).patch('/api/v1/me/notifications/'+rows[0].id+'/read').set('Cookie',f.admin.cookie).expect(404);
    const read=await request(server).patch('/api/v1/me/notifications/'+rows[0].id+'/read').set('Cookie',f.owner.cookie).expect(200);expect((read.body as NotificationDto).reminder?.purpose).toBe('Seguimiento institucional');
    expect(await notifications.unreadCount(f.owner.id)).toEqual({count:0});
    const after=kind==='intent'?await prisma.contactIntent.findUniqueOrThrow({where:{id:f.resource.id}}):await prisma.relationshipProcess.findUniqueOrThrow({where:{id:f.resource.id}});expect(after).toEqual(before);
  });
  it('nueva actuación formal crea ciclo y conserva el recordatorio anterior',async()=>{
    const f=await fixture();await scheduler.sweep(f.now);
    const changed=await processes.changeState(f.resource.id,{state:'IN_PROGRESS',expectedVersion:f.resource.version},f.owner.id);
    await scheduler.sweep(new Date(+new Date(changed.lastActivityAt)+7*days));
    expect(await occurrences(f.resource.id)).toHaveLength(2);expect(await notifications.unreadCount(f.owner.id)).toEqual({count:2});
  });
  it.each(['CANCELLED','CONVERTED','CLOSED'] as const)('excluye intención terminal %s',async state=>{
    const f=await fixture('intent');if(state==='CANCELLED')await intents.cancel(f.resource.id,f.resource.version,f.owner.id);
    else if(state==='CONVERTED')await intents.convert(f.resource.id,f.resource.version,f.owner.id);
    else await prisma.contactIntent.update({where:{id:f.resource.id},data:{state:'CLOSED'}});
    await scheduler.sweep(f.now);expect(await occurrences(f.resource.id)).toHaveLength(0);
  });
  it('excluye proceso cerrado; no reabre',async()=>{
    const f=await fixture();await processes.close(f.resource.id,{result:'NO_RESPONSE',expectedVersion:f.resource.version},f.owner.id);
    await scheduler.sweep(f.now);expect(await occurrences(f.resource.id)).toHaveLength(0);
  });
  it.each(['intent','process'] as const)('autor/participante inactivo fija %s sin entrega retroactiva',async kind=>{
    const f=await fixture(kind);await prisma.user.update({where:{id:f.owner.id},data:{isActive:false,deactivatedAt:new Date()}});await scheduler.sweep(f.now);
    expect(await occurrences(f.resource.id)).toHaveLength(1);expect(await prisma.notification.count({where:{recipientUserId:f.owner.id}})).toBe(0);
    await prisma.user.update({where:{id:f.owner.id},data:{isActive:true,deactivatedAt:null}});await scheduler.sweep(f.now);expect(await notifications.unreadCount(f.owner.id)).toEqual({count:0});
  });
  it('entrega a participantes formales distintos, no por rol ni nota',async()=>{
    const f=await fixture();await prisma.processParticipant.create({data:{processId:f.resource.id,userId:f.outsider.id,origin:'SENT_COMMUNICATION'}});
    await scheduler.sweep(f.now);expect(await notifications.unreadCount(f.outsider.id)).toEqual({count:1});expect(await notifications.unreadCount(f.admin.id)).toEqual({count:0});
  });
  it.each(['intent','process'] as const)('suprime %s con no-contact y reconsidera al levantar restricción',async kind=>{
    const f=await fixture(kind),restrictions=app.get(ContactRestrictionsService);
    const restriction=await restrictions.create({organizationId:f.org.id,reason:'No contactar'},f.admin.id);
    await scheduler.sweep(f.now);expect(await occurrences(f.resource.id)).toHaveLength(0);
    await restrictions.lift(restriction.id,{expectedVersion:restriction.version,reason:'Autorización institucional'},f.admin.id);
    await scheduler.sweep(f.now);expect(await occurrences(f.resource.id)).toHaveLength(1);
  });
  it('admin configura y audita; otros roles/anónimo rechazados; conflicto y validación',async()=>{
    const f=await fixture(),server=app.getHttpServer();
    await request(server).get('/api/v1/settings/reminders').expect(401);
    for(const role of [UserRole.RESEARCH,UserRole.PLANNING,UserRole.BOARD]){const user=await actor(role);await request(server).get('/api/v1/settings/reminders').set('Cookie',user.cookie).expect(403);await request(server).patch('/api/v1/settings/reminders').set('Cookie',user.cookie).send({intervalDays:5,expectedVersion:1}).expect(403);}
    const initial=await request(server).get('/api/v1/settings/reminders').set('Cookie',f.admin.cookie).expect(200);expect(initial.body).toEqual({intervalDays:7,version:1});
    await request(server).patch('/api/v1/settings/reminders').set('Cookie',f.admin.cookie).send({intervalDays:0,expectedVersion:1}).expect(400);
    await request(server).patch('/api/v1/settings/reminders').set('Cookie',f.admin.cookie).send({intervalDays:5,expectedVersion:1}).expect(200);
    await request(server).patch('/api/v1/settings/reminders').set('Cookie',f.admin.cookie).send({intervalDays:14,expectedVersion:1}).expect(409);
    const audit=await prisma.auditEvent.findFirstOrThrow({where:{action:'REMINDER_INTERVAL_UPDATED',actorUserId:f.admin.id}});expect(audit.previousReminderIntervalDays).toBe(7);expect(audit.newReminderIntervalDays).toBe(5);
    expect(await prisma.relationshipProcess.findUniqueOrThrow({where:{id:f.resource.id}})).toMatchObject({state:'PREPARATION',lastActivityAt:f.anchor});
  });
  it('revalida administrador inactivo en la operación de configuración',async()=>{
    const f=await fixture();await prisma.user.update({where:{id:f.admin.id},data:{isActive:false,deactivatedAt:new Date()}});await expect(settings.update({intervalDays:5,expectedVersion:1},f.admin.id)).rejects.toThrow();
  });
  it('cambios 7→5→14 respetan ciclos e historia',async()=>{
    const f=await fixture(),six=new Date(+f.anchor+6*days);await scheduler.sweep(six);expect(await occurrences(f.resource.id)).toHaveLength(0);
    await settings.update({intervalDays:5,expectedVersion:1},f.admin.id);await scheduler.sweep(six);const previous=await occurrences(f.resource.id);expect(previous[0].intervalDaysSnapshot).toBe(5);
    await settings.update({intervalDays:14,expectedVersion:2},f.admin.id);await scheduler.sweep(new Date(+f.anchor+20*days));expect(await occurrences(f.resource.id)).toEqual(previous);
  });
  it('dos cambios concurrentes de settings dejan un solo ganador y auditoría',async()=>{
    const f=await fixture();const results=await Promise.allSettled([settings.update({intervalDays:5,expectedVersion:1},f.admin.id),settings.update({intervalDays:14,expectedVersion:1},f.admin.id)]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(await prisma.auditEvent.count({where:{actorUserId:f.admin.id,action:'REMINDER_INTERVAL_UPDATED'}})).toBe(1);
  });
  it('un barrido conserva snapshot aun si configuración cambia después de empezar',async()=>{
    const f=await fixture(),sources=app.get(InactivitySourcesService),original=sources.candidates.bind(sources);let changed=false;
    jest.spyOn(sources,'candidates').mockImplementation(async(...args)=>{if(!changed){changed=true;await settings.update({intervalDays:14,expectedVersion:1},f.admin.id);}return original(...args);});
    await scheduler.sweep(f.now);expect((await occurrences(f.resource.id))[0]).toMatchObject({intervalDaysSnapshot:7,settingsVersionSnapshot:1});
  });
  it.each(['activity','close'] as const)('revalida carrera de %s después de seleccionar candidato',async operation=>{
    const f=await fixture(),sources=app.get(InactivitySourcesService),original=sources.candidates.bind(sources);let changed=false;
    jest.spyOn(sources,'candidates').mockImplementation(async(...args)=>{const rows=await original(...args);if(args[0]==='process'&&!changed&&rows.length){changed=true;if(operation==='close')await processes.close(f.resource.id,{result:'NO_RESPONSE',expectedVersion:f.resource.version},f.owner.id);else await processes.changeState(f.resource.id,{state:'IN_PROGRESS',expectedVersion:f.resource.version},f.owner.id);}return rows;});
    await scheduler.sweep(f.now);expect(await occurrences(f.resource.id)).toHaveLength(0);
  });
  it('advisory lock ocupado difiere el lote y el siguiente barrido recupera',async()=>{
    const f=await fixture();let release!:()=>void,ready!:()=>void;const held=new Promise<void>(resolve=>ready=resolve),wait=new Promise<void>(resolve=>release=resolve);
    const locking=prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT pg_advisory_xact_lock(1128612691,47)::text`;ready();await wait;});await held;
    try{await scheduler.sweep(f.now);expect(await occurrences(f.resource.id)).toHaveLength(0);}finally{release();await locking;}
    await scheduler.sweep(f.now);expect(await occurrences(f.resource.id)).toHaveLength(1);
  });
  it('dos instancias y reinicio no duplican el ciclo',async()=>{
    const f=await fixture();await Promise.all([scheduler.sweep(f.now),scheduler.sweep(f.now)]);await scheduler.sweep(f.now);
    expect(await occurrences(f.resource.id)).toHaveLength(1);expect(await notifications.unreadCount(f.owner.id)).toEqual({count:1});
  });
  it('fallo de entrega revierte occurrence y permite reintento sin afectar otro candidato',async()=>{
    const f=await fixture(),second=await intents.create({organizationId:f.org.id,purpose:'Segundo seguimiento'},f.owner.id);
    jest.spyOn(Logger.prototype,'error').mockImplementation(()=>undefined);jest.spyOn(notifications,'deliverReminder').mockRejectedValueOnce(new Error('QA rollback'));
    expect((await scheduler.sweep(f.now)).failed).toBe(1);expect((await occurrences(f.resource.id)).length+(await occurrences(second.id)).length).toBe(1);
    await scheduler.sweep(f.now);expect(await occurrences(f.resource.id)).toHaveLength(1);expect(await occurrences(second.id)).toHaveLength(1);
  });
  it('constraints protegen exclusividad, FK, ciclo, ancla, procedencia y snapshots',async()=>{
    const f=await fixture();await scheduler.sweep(f.now);const [row]=await occurrences(f.resource.id);const {id:_id,...data}=row;void _id;
    await expect(prisma.reminderOccurrence.create({data})).rejects.toThrow();
    await expect(prisma.reminderOccurrence.create({data:{...data,processId:randomUUID()}})).rejects.toThrow();
    await expect(prisma.reminderOccurrence.create({data:{...data,intentId:randomUUID()}})).rejects.toThrow();
    await expect(prisma.reminderOccurrence.create({data:{...data,processId:null}})).rejects.toThrow();
    await expect(prisma.reminderOccurrence.update({where:{id:row.id},data:{intervalDaysSnapshot:14}})).rejects.toThrow();
    await expect(prisma.notification.create({data:{recipientUserId:f.owner.id,reminderId:row.id,type:'INTENT_INACTIVITY_REMINDER'}})).rejects.toThrow();
    await expect(prisma.notification.create({data:{recipientUserId:f.owner.id,reminderId:randomUUID(),type:'PROCESS_INACTIVITY_REMINDER'}})).rejects.toThrow();
    const notification=await prisma.notification.findFirstOrThrow({where:{reminderId:row.id}});
    await expect(prisma.notification.update({where:{id:notification.id},data:{reminderId:randomUUID()}})).rejects.toThrow();
  });
  it('paginación, contador y leído se reutilizan para varios ciclos',async()=>{
    const f=await fixture();await scheduler.sweep(f.now);const changed=await processes.changeState(f.resource.id,{state:'IN_PROGRESS',expectedVersion:1},f.owner.id);await scheduler.sweep(new Date(+new Date(changed.lastActivityAt)+8*days));
    const page=await notifications.list(f.owner.id,{pageSize:1});expect(page.items).toHaveLength(1);expect(page.nextCursor).toBeTruthy();
    const next=await notifications.list(f.owner.id,{pageSize:1,after:page.nextCursor!});expect(next.items[0].id).not.toBe(page.items[0].id);
    await notifications.markRead(f.owner.id,page.items[0].id);expect((await notifications.list(f.owner.id,{status:'unread'})).items).toHaveLength(1);
  });
  it('reunión futura no aplaza recordatorio ni redefine actividad o participación',async()=>{
    const f=await fixture();await app.get(MeetingsService).create({processId:f.resource.id,scheduledLocal:'2099-10-15T10:00',timezone:'America/La_Paz',modality:'ONLINE',purpose:'Reunión futura'},f.owner.id,randomUUID());
    const current=await prisma.relationshipProcess.findUniqueOrThrow({where:{id:f.resource.id}});expect(current.lastActivityAt).toEqual(f.anchor);
    await scheduler.sweep(f.now);expect(await occurrences(f.resource.id)).toHaveLength(1);
    expect(await prisma.processParticipant.count({where:{processId:f.resource.id}})).toBe(1);
  });
  it('nota interna no genera audiencia ni inicia un ciclo',async()=>{
    const f=await fixture();await app.get(InternalNotesService).create(f.resource.id,'Observación interna',f.outsider.id);
    await scheduler.sweep(f.now);expect(await notifications.unreadCount(f.outsider.id)).toEqual({count:0});
    expect((await prisma.relationshipProcess.findUniqueOrThrow({where:{id:f.resource.id}})).lastActivityAt).toEqual(f.anchor);
  });
  it('lotes de 25 recorren candidatos sin perder el siguiente lote',async()=>{
    const owner=await actor(),org=await prisma.organization.create({data:{name:'Institución lotes '+randomUUID()}});orgs.push(org.id);
    const anchor=new Date();await prisma.contactIntent.createMany({data:Array.from({length:26},(_,i)=>({organizationId:org.id,authorUserId:owner.id,purpose:'Seguimiento '+i,createdAt:anchor,lastActivityAt:anchor,updatedAt:anchor}))});
    const result=await scheduler.sweep(new Date(+anchor+8*days));expect(result.detected).toBe(26);expect(await notifications.unreadCount(owner.id)).toEqual({count:26});
  });
  it('lock de actividad pendiente no bloquea el scheduler y se reintenta',async()=>{
    const f=await fixture();let release!:()=>void,ready!:()=>void;const held=new Promise<void>(resolve=>ready=resolve),wait=new Promise<void>(resolve=>release=resolve);
    const locking=prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "RelationshipProcess" WHERE id=${f.resource.id}::uuid FOR UPDATE`;ready();await wait;});await held;
    jest.spyOn(Logger.prototype,'error').mockImplementation(()=>undefined);
    try{expect((await scheduler.sweep(f.now)).failed).toBe(1);expect(await occurrences(f.resource.id)).toHaveLength(0);}finally{release();await locking;}
    await scheduler.sweep(f.now);expect(await occurrences(f.resource.id)).toHaveLength(1);
  });
  it('rollback de auditoría revierte configuración y versión',async()=>{
    const f=await fixture();jest.spyOn(app.get(AuditService),'recordReminderSettings').mockRejectedValueOnce(new Error('QA audit rollback'));
    await expect(settings.update({intervalDays:5,expectedVersion:1},f.admin.id)).rejects.toThrow();expect(await settings.get(f.admin.id)).toEqual({intervalDays:7,version:1});
  });
});
