import { MeetingsService } from '../src/modules/meetings/meetings.service';
import { MeetingClock } from '../src/modules/meetings/meeting-clock';
import { RelationshipProcessesService } from '../src/modules/relationships/relationship-processes.service';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { OpportunitiesService } from '../src/modules/opportunities/opportunities.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { NotificationConsumer } from '../src/modules/notifications/notification-consumer';
import type { NotificationPageDto } from '../src/modules/notifications/notification.dto';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Notificaciones requieren base aislada _test.');

describe('P1 notificaciones PostgreSQL/HTTP', () => {
  let app: INestApplication<Server>, prisma: PrismaService, consumer: NotificationConsumer,
    opportunities: OpportunitiesService, notifications: NotificationsService;
  const userIds: string[] = [], orgIds: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = module.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); consumer = app.get(NotificationConsumer);
    opportunities = app.get(OpportunitiesService); notifications = app.get(NotificationsService);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    const owned = { opportunity: { createdByUserId: { in: userIds } } };
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { OR: [{ recipientUserId: { in: userIds } }, { delivery: { sourceEvent: { actorUserId: { in: userIds } } } }] } }),
      prisma.notificationDelivery.deleteMany({ where: { OR:[{sourceEvent:{actorUserId:{in:userIds}}},{meetingSourceEvent:{actorUserId:{in:userIds}}}] } }),
      prisma.notificationCheckpoint.deleteMany(),
      prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.meetingEvent.deleteMany({where:{actorUserId:{in:userIds}}}),
      prisma.meetingAgreement.deleteMany({where:{createdByUserId:{in:userIds}}}),
      prisma.meetingParticipant.deleteMany({where:{meeting:{createdByUserId:{in:userIds}}}}),
      prisma.meeting.deleteMany({where:{createdByUserId:{in:userIds}}}),
      prisma.relationshipProcessEvent.deleteMany({where:{actorUserId:{in:userIds}}}),
      prisma.processParticipant.deleteMany({where:{process:{createdByUserId:{in:userIds}}}}),
      prisma.relationshipProcess.deleteMany({where:{createdByUserId:{in:userIds}}}),
      prisma.opportunityEvent.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.opportunityOrganization.deleteMany({ where: owned }), prisma.opportunity.deleteMany({ where: { createdByUserId: { in: userIds } } }),
      prisma.organization.deleteMany({ where: { id: { in: orgIds } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }), prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    userIds.length = orgIds.length = 0;
  });
  afterAll(async () => { await app.close(); });
  async function actor(role: UserRole = UserRole.RESEARCH) {
    const user = await app.get(UsersService).createIdentity({ givenNames: 'QA', familyNames: randomUUID().slice(0, 8), email: randomUUID() + '@example.test', role });
    userIds.push(user.id);
    const token = await prisma.$transaction(tx => app.get(SessionsService).create(user.id, tx));
    return { ...user, cookie: 'cecasem_session=' + token };
  }
  async function create(ownerId: string) {
    const org = await prisma.organization.create({ data: { name: 'Organización P0 ' + randomUUID() } }); orgIds.push(org.id);
    return opportunities.create({ name: 'Oportunidad P0', organizationIds: [org.id] }, ownerId, randomUUID());
  }

  const future={scheduledLocal:'2099-10-15T10:00',timezone:'America/La_Paz',modality:'ONLINE' as const,purpose:'Continuidad institucional'};
  const past={...future,scheduledLocal:'2000-01-15T10:00'};
  async function fixture(historical=false) {
    const owner=await actor(), formal=await actor(), internal=await actor(UserRole.PLANNING), outsider=await actor(), board=await actor(UserRole.BOARD), admin=await actor(UserRole.ADMINISTRATOR);
    const org=await prisma.organization.create({data:{name:'Institución P1 '+randomUUID()}});orgIds.push(org.id);
    const process=await app.get(RelationshipProcessesService).create({organizationId:org.id,purpose:'Continuidad'},formal.id);
    const service=app.get(MeetingsService);
    let meeting=await service.create({...historical?past:future,processId:process.id},owner.id,randomUUID());
    meeting=await service.addParticipant(meeting.id,{userId:internal.id,expectedVersion:meeting.version},owner.id,randomUUID());
    return {owner,formal,internal,outsider,board,admin,org,process,meeting,service};
  }
  async function audience(meetingId:string,type?:'MEETING_CREATED'|'MEETING_CANCELLED'|'MEETING_COMPLETED'|'MEETING_PARTICIPANT_ADDED'|'MEETING_RESCHEDULED') {
    return (await prisma.notification.findMany({where:{meetingId,...type?{type}:{}},select:{recipientUserId:true}})).map(row=>row.recipientUserId).sort();
  }
  it('creación avisa a participantes reales; incorporación solo al invitado; sin globalidad',async()=>{
    const f=await fixture();await consumer.consumeBatch();
    expect(await audience(f.meeting.id,'MEETING_CREATED')).toEqual([f.formal.id,f.internal.id].sort());
    expect(await audience(f.meeting.id,'MEETING_PARTICIPANT_ADDED')).toEqual([f.internal.id]);
    for(const user of [f.owner,f.outsider,f.board,f.admin])expect(await notifications.unreadCount(user.id)).toEqual({count:0});
  });
  it('referencias externas/textuales no crean cuentas ni notificaciones',async()=>{
    const f=await fixture(),before=await prisma.user.count();
    await f.service.addParticipant(f.meeting.id,{nameSnapshot:'Persona externa mencionada',expectedVersion:f.meeting.version},f.owner.id,randomUUID());
    await consumer.consumeBatch();expect(await prisma.user.count()).toBe(before);
    expect(await audience(f.meeting.id,'MEETING_PARTICIPANT_ADDED')).toEqual([f.internal.id]);
    expect(await prisma.notificationDelivery.count({where:{meetingId:f.meeting.id}})).toBe(2);
  });
  it('cancelación informa a ambos grupos y excluye al actor aunque sea participante',async()=>{
    const f=await fixture();await consumer.consumeBatch();
    await f.service.cancel(f.meeting.id,{reason:'Cambio institucional',expectedVersion:f.meeting.version},f.formal.id,randomUUID());
    await consumer.consumeBatch();expect(await audience(f.meeting.id,'MEETING_CANCELLED')).toEqual([f.owner.id,f.internal.id].sort());
  });
  it('realización informa continuidad; asistencia/acuerdo no agregan avisos ni recibos',async()=>{
    const f=await fixture(true);await consumer.consumeBatch();
    let row=await f.service.complete(f.meeting.id,{expectedVersion:f.meeting.version},f.owner.id,randomUUID());
    await consumer.consumeBatch();expect(await audience(row.id,'MEETING_COMPLETED')).toEqual([f.formal.id,f.internal.id].sort());
    const before=await prisma.notification.count({where:{meetingId:row.id}}),receipts=await prisma.notificationDelivery.count({where:{meetingId:row.id}});
    const participant=await prisma.meetingParticipant.findFirstOrThrow({where:{meetingId:row.id,userId:f.internal.id}});
    row=await f.service.attendance(row.id,participant.id,{attendance:'ATTENDED',expectedVersion:row.version},f.owner.id,randomUUID());
    await f.service.agreement(row.id,{text:'Contenido reservado del acuerdo',expectedVersion:row.version},f.owner.id,randomUUID());
    await consumer.consumeBatch();expect(await prisma.notification.count({where:{meetingId:row.id}})).toBe(before);expect(await prisma.notificationDelivery.count({where:{meetingId:row.id}})).toBe(receipts);
    const facts=await f.service.recordedActivity();expect(facts.items.find(event=>event.type==='AGREEMENT_ADDED')?.changes).toEqual({});
  });
  it.each(['scheduledLocal','timezone','modality','meetingUrl','location'] as const)('cambio material %s produce un aviso por destinatario',async field=>{
    const f=await fixture();await consumer.consumeBatch();
    const changes={scheduledLocal:'2099-10-16T10:00',timezone:'UTC',modality:'HYBRID' as const,meetingUrl:'https://example.test/reunion',location:'Sala institucional'};
    await f.service.update(f.meeting.id,{...future,...field==='location'?{modality:'HYBRID' as const}:{},[field]:changes[field],expectedVersion:f.meeting.version},f.owner.id,randomUUID());
    await consumer.consumeBatch();expect(await audience(f.meeting.id,'MEETING_RESCHEDULED')).toEqual([f.formal.id,f.internal.id].sort());
  });
  it('propósito menor e incorporación externa no producen avisos',async()=>{
    const f=await fixture();await consumer.consumeBatch();const before=await prisma.notification.count();
    await f.service.update(f.meeting.id,{...future,purpose:'Texto corregido',expectedVersion:f.meeting.version},f.owner.id,randomUUID());
    await consumer.consumeBatch();expect(await prisma.notification.count()).toBe(before);
  });
  it('oportunidad descartada preserva P0 y excluye Búsqueda global',async()=>{
    const owner=await actor(),planning=await actor(UserRole.PLANNING),board=await actor(UserRole.BOARD),admin=await actor(UserRole.ADMINISTRATOR),other=await actor();
    const row=await create(owner.id);await consumer.consumeBatch();await opportunities.discard(row.id,{reason:'No corresponde',expectedVersion:1},owner.id);await consumer.consumeBatch();
    const rows=await prisma.notification.findMany({where:{opportunityId:row.id}});
    for(const type of ['OPPORTUNITY_CREATED','OPPORTUNITY_DISCARDED'])expect(rows.filter(r=>r.type===type).map(r=>r.recipientUserId).sort()).toEqual([planning.id,board.id,admin.id].sort());
    expect(await notifications.unreadCount(other.id)).toEqual({count:0});await consumer.consumeBatch();expect(await prisma.notification.count({where:{opportunityId:row.id,type:'OPPORTUNITY_CREATED'}})).toBe(3);
  });
  it('estados intermedios no notifican; finalización sí',async()=>{
    const owner=await actor(),planning=await actor(UserRole.PLANNING);let row=await create(owner.id);await consumer.consumeBatch();
    for(const status of ['PREPARING','SUBMITTED'] as const){row=await opportunities.changeState(row.id,{status,expectedVersion:row.version},owner.id);await consumer.consumeBatch();expect(await notifications.unreadCount(planning.id)).toEqual({count:1});}
    row=await opportunities.changeState(row.id,{status:'FINISHED',finalResult:'Cierre institucional',expectedVersion:row.version},owner.id);await consumer.consumeBatch();expect(await notifications.unreadCount(planning.id)).toEqual({count:2});
    expect(await prisma.notification.count({where:{opportunityId:row.id,type:'OPPORTUNITY_FINISHED'}})).toBe(1);
  });
  it('P0 conserva actor institucional; P1 omite su propia acción',async()=>{
    const owner=await actor(UserRole.PLANNING),board=await actor(UserRole.BOARD);const row=await create(owner.id);await consumer.consumeBatch();
    expect(await notifications.unreadCount(owner.id)).toEqual({count:1});await opportunities.discard(row.id,{reason:'No continuar',expectedVersion:1},owner.id);await consumer.consumeBatch();
    expect(await notifications.unreadCount(owner.id)).toEqual({count:1});expect(await notifications.unreadCount(board.id)).toEqual({count:2});
  });
  it('inactivo no recibe; reactivación no entrega retroactivamente; historia previa permanece',async()=>{
    const f=await fixture();await consumer.consumeBatch();const before=await notifications.unreadCount(f.internal.id);
    await prisma.user.update({where:{id:f.internal.id},data:{isActive:false,deactivatedAt:new Date()}});
    await f.service.cancel(f.meeting.id,{reason:'Cancelada',expectedVersion:f.meeting.version},f.owner.id,randomUUID());await consumer.consumeBatch();
    expect(await audience(f.meeting.id,'MEETING_CANCELLED')).toEqual([f.formal.id]);
    await prisma.user.update({where:{id:f.internal.id},data:{isActive:true,deactivatedAt:null}});await consumer.consumeBatch();expect(await notifications.unreadCount(f.internal.id)).toEqual(before);
  });
  it('mezcla fuentes con orden/cursor global, filtros y lectura propia sin alterar dominios',async()=>{
    const f=await fixture();await create(f.owner.id);await consumer.consumeBatch();
    const first=await notifications.list(f.internal.id,{pageSize:1}),second=await notifications.list(f.internal.id,{pageSize:1,after:first.nextCursor!});expect(first.items[0].id).not.toBe(second.items[0].id);
    const all=await notifications.list(f.internal.id,{});expect(all.items.some(n=>n.meeting?.id===f.meeting.id)).toBe(true);expect(all.items.some(n=>n.opportunity)).toBe(true);
    const before=await prisma.meetingEvent.count();await notifications.markRead(f.internal.id,first.items[0].id);expect((await notifications.list(f.internal.id,{status:'read'})).items).toHaveLength(1);expect(await prisma.meetingEvent.count()).toBe(before);
    expect(await notifications.unreadCount(f.internal.id)).toEqual({count:2});
    await request(app.getHttpServer()).patch('/api/v1/me/notifications/'+first.items[0].id+'/read').set('Cookie',f.admin.cookie).send({}).expect(404);
  });
  it('contrato HTTP mínimo y no-store; no expone acuerdos ni participantes externos',async()=>{
    const f=await fixture();await consumer.consumeBatch();const response=await request(app.getHttpServer()).get('/api/v1/me/notifications').set('Cookie',f.internal.cookie).expect(200).expect('Cache-Control','no-store');
    const data=response.body as NotificationPageDto;expect(data.items[0].meeting).toMatchObject({id:f.meeting.id,timezone:'America/La_Paz',processId:f.process.id});expect(data.items[0].opportunity).toBeNull();
    expect(Object.keys(data.items[0].meeting!).sort()).toEqual(['id','opportunityId','processId','purpose','scheduledAt','timezone']);
    await request(app.getHttpServer()).get('/api/v1/me/notifications').expect(401);
  });
  it('concurrente/reinicio/reprocesamientos no duplican ni recalculan destinatarios',async()=>{
    const f=await fixture();await Promise.all([consumer.consumeBatch(),consumer.consumeBatch()]);
    const before=await prisma.notification.count();await prisma.user.update({where:{id:f.outsider.id},data:{role:UserRole.PLANNING}});
    const restarted=new NotificationConsumer(prisma,opportunities,app.get(UsersService),app.get(ConfigService),f.service);
    for(let i=0;i<10;i++)await restarted.consumeBatch();expect(await prisma.notification.count()).toBe(before);expect(await notifications.unreadCount(f.outsider.id)).toEqual({count:0});
    expect(await prisma.notificationCheckpoint.count()).toBe(2);
  });
  it('recibo sin destinatarios impide retroactividad al incorporar luego nuevos usuarios',async()=>{
    const f=await fixture();await prisma.user.updateMany({where:{id:{in:[f.formal.id,f.internal.id]}},data:{isActive:false,deactivatedAt:new Date()}});await consumer.consumeBatch();
    expect(await audience(f.meeting.id)).toHaveLength(0);expect(await prisma.notificationDelivery.count({where:{meetingId:f.meeting.id}})).toBe(2);
    await prisma.user.updateMany({where:{id:{in:[f.formal.id,f.internal.id]}},data:{isActive:true,deactivatedAt:null}});await consumer.consumeBatch();expect(await audience(f.meeting.id)).toHaveLength(0);
  });
  it('FKs, tipo/contexto, invitado y procedencia inmutable protegen inserciones directas',async()=>{
    const f=await fixture();await consumer.consumeBatch();const row=await prisma.notification.findFirstOrThrow({where:{meetingId:f.meeting.id,type:'MEETING_CREATED'}});
    const data={sourceEventId:row.sourceEventId,meetingId:f.meeting.id,recipientUserId:f.outsider.id,type:'MEETING_CREATED' as const};
    await expect(prisma.notification.create({data:{...data,type:'MEETING_CANCELLED'}})).rejects.toThrow();
    await expect(prisma.notification.create({data:{...data,meetingId:randomUUID()}})).rejects.toThrow();
    await expect(prisma.notification.create({data:{...data,opportunityId:randomUUID()}})).rejects.toThrow();
    await expect(prisma.notification.update({where:{id:row.id},data:{meetingId:randomUUID()}})).rejects.toThrow();
    await expect(prisma.notificationDelivery.create({data:{sourceEventId:randomUUID(),meetingId:f.meeting.id,meetingSourceType:'CREATED',sourceType:null}})).rejects.toThrow();
    await expect(prisma.notificationDelivery.update({where:{sourceEventId:row.sourceEventId},data:{processedAt:new Date(0)}})).rejects.toThrow();
    const invitation=await prisma.notification.findFirstOrThrow({where:{meetingId:f.meeting.id,type:'MEETING_PARTICIPANT_ADDED'}});
    await expect(prisma.notification.create({data:{...data,sourceEventId:invitation.sourceEventId,type:'MEETING_PARTICIPANT_ADDED'}})).rejects.toThrow();
    await expect(prisma.notification.create({data:{sourceEventId:row.sourceEventId,meetingId:f.meeting.id,recipientUserId:row.recipientUserId,type:'MEETING_CREATED'}})).rejects.toThrow();
  });
  it('rechaza recibos para cambios menores, asistencia y acuerdos',async()=>{
    const f=await fixture();await f.service.update(f.meeting.id,{...future,purpose:'Corrección menor',expectedVersion:f.meeting.version},f.owner.id,randomUUID());
    const event=await prisma.meetingEvent.findFirstOrThrow({where:{meetingId:f.meeting.id,type:'UPDATED'}});
    await expect(prisma.notificationDelivery.create({data:{sourceEventId:event.id,meetingId:f.meeting.id,meetingSourceType:'UPDATED',sourceType:null}})).rejects.toThrow();
    await expect(prisma.notificationDelivery.create({data:{sourceEventId:event.id,meetingId:f.meeting.id,meetingSourceType:'ATTENDANCE_RECORDED',sourceType:null}})).rejects.toThrow();
  });
  it('rollback del productor no confirma hechos; fallo posterior no revierte reunión',async()=>{
    const f=await fixture(true);jest.spyOn(Logger.prototype,'error').mockImplementation(()=>undefined);
    jest.spyOn(app.get(AuditService),'recordMeeting').mockRejectedValueOnce(new Error('fallo controlado'));
    await expect(f.service.complete(f.meeting.id,{expectedVersion:f.meeting.version},f.owner.id,randomUUID())).rejects.toThrow();expect((await f.service.get(f.meeting.id,f.owner.id)).status).toBe('SCHEDULED');
    await f.service.complete(f.meeting.id,{expectedVersion:f.meeting.version},f.owner.id,randomUUID());jest.spyOn(f.service,'recordedActivity').mockRejectedValueOnce(new Error('consumidor'));
    await expect(consumer.consumeBatch()).rejects.toThrow();expect((await f.service.get(f.meeting.id,f.owner.id)).status).toBe('COMPLETED');await consumer.consumeBatch();expect(await audience(f.meeting.id,'MEETING_COMPLETED')).toHaveLength(2);
  });
  it('límite superior termina barrido aun con altas nuevas y reinicio',async()=>{
    const f=await fixture();for(let i=0;i<25;i++)await f.service.create({...future,processId:f.process.id},f.owner.id,randomUUID());
    await consumer.consumeBatch();const first=await prisma.notificationCheckpoint.findUniqueOrThrow({where:{id:'meeting-activity'}});expect(first.afterEventId).not.toBeNull();expect(first.throughEventId).not.toBeNull();
    await f.service.create({...future,processId:f.process.id},f.owner.id,randomUUID());const restarted=new NotificationConsumer(prisma,opportunities,app.get(UsersService),app.get(ConfigService),f.service);await restarted.consumeBatch();
    expect((await prisma.notificationCheckpoint.findUniqueOrThrow({where:{id:'meeting-activity'}})).completedSweeps).toBe(1);await restarted.consumeBatch();await restarted.consumeBatch();
    expect(await prisma.notificationDelivery.count({where:{meetingId:{not:null}}})).toBe(28);
  });
  it('frontera valida cursor y mantiene compatibilidad con dos argumentos',async()=>{
    const f=await fixture();expect((await f.service.recordedActivity(undefined,1)).items).toHaveLength(1);
    await expect(f.service.recordedActivity({id:'no-uuid',createdAt:new Date()},1)).rejects.toThrow();await expect(f.service.recordedActivity(undefined,101)).rejects.toThrow();
    const upper=await f.service.recordedActivityUpperBound();expect((await f.service.recordedActivity(undefined,100,upper!)).items).toHaveLength(2);
  });

  it('fallo parcial de un evento revierte recibo/avisos, continúa y se recupera',async()=>{
    const f=await fixture(),source=await prisma.meetingEvent.findFirstOrThrow({where:{meetingId:f.meeting.id,type:'CREATED'}});
    jest.spyOn(Logger.prototype,'error').mockImplementation(()=>undefined);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION p1_test_delivery_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."sourceEventId"='${source.id}'::uuid AND NEW."recipientUserId"='${f.internal.id}'::uuid THEN RAISE EXCEPTION 'controlled failure'; END IF; RETURN NEW; END; $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER p1_test_delivery_failure BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION p1_test_delivery_failure()');
    try {
      expect((await consumer.consumeBatch()).failed).toBe(1);expect(await audience(f.meeting.id,'MEETING_CREATED')).toHaveLength(0);
      expect(await prisma.notificationDelivery.count({where:{sourceEventId:source.id}})).toBe(0);expect(await audience(f.meeting.id,'MEETING_PARTICIPANT_ADDED')).toEqual([f.internal.id]);
    } finally {await prisma.$executeRawUnsafe('DROP TRIGGER p1_test_delivery_failure ON "Notification"');await prisma.$executeRawUnsafe('DROP FUNCTION p1_test_delivery_failure()');}
    await consumer.consumeBatch();expect(await audience(f.meeting.id,'MEETING_CREATED')).toHaveLength(2);expect(await prisma.notificationDelivery.count({where:{sourceEventId:source.id}})).toBe(1);
  });
  it('commit tardío de reunión detrás del cursor se recupera con barrido repetido',async()=>{
    const f=await fixture(),lateActor=await actor(),opportunity=await create(lateActor.id);
    let ready!:()=>void,release!:()=>void;const inserted=new Promise<void>(resolve=>{ready=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
    const audit=app.get(AuditService),original=audit.recordMeeting.bind(audit),clock=app.get(MeetingClock);
    jest.spyOn(clock,'now').mockReturnValue(new Date('2001-01-01T00:00:00.000Z'));
    jest.spyOn(audit,'recordMeeting').mockImplementation((id,actorId,tx)=>original(id,actorId,tx).then(async row=>{if(actorId===lateActor.id){ready();await gate;}return row;}) as ReturnType<AuditService['recordMeeting']>);
    const pending=f.service.create({...future,opportunityId:opportunity.id},lateActor.id,randomUUID());await inserted;
    let late;
    try {await consumer.consumeBatch();expect((await prisma.notificationCheckpoint.findUniqueOrThrow({where:{id:'meeting-activity'}})).completedSweeps).toBe(1);}
    finally {release();late=await pending;}
    jest.restoreAllMocks();await consumer.consumeBatch();expect(await prisma.notificationDelivery.count({where:{meetingId:late.id}})).toBe(1);
  });
  it('audiencia y proyecciones usan consultas por lote, no por cada reunión',async()=>{
    const f=await fixture();for(let i=0;i<8;i++)await f.service.create({...future,processId:f.process.id},f.owner.id,randomUUID());
    const audience=jest.spyOn(f.service,'notificationAudience'),candidates=jest.spyOn(app.get(UsersService),'notificationCandidates'),formal=jest.spyOn(app.get(RelationshipProcessesService),'notificationParticipants');
    await consumer.consumeBatch();expect(audience).toHaveBeenCalledTimes(1);expect(candidates).toHaveBeenCalledTimes(1);expect(formal).toHaveBeenCalledTimes(1);
    const summaries=jest.spyOn(f.service,'notificationSummaries');await notifications.list(f.formal.id,{pageSize:100});expect(summaries).toHaveBeenCalledTimes(1);expect(summaries.mock.calls[0][0]).toHaveLength(9);
  });

  it('fallo total de Opportunities no impide confirmar y recuperar Meetings',async()=>{
    const f=await fixture();await create(f.owner.id);
    jest.spyOn(opportunities,'recordedActivity').mockRejectedValueOnce(new Error('frontera no disponible'));
    await expect(consumer.consumeBatch()).rejects.toThrow();expect(await audience(f.meeting.id,'MEETING_CREATED')).toHaveLength(2);
    expect(await prisma.notificationCheckpoint.count({where:{id:'meeting-activity'}})).toBe(1);
    await consumer.consumeBatch();expect(await audience(f.meeting.id,'MEETING_CREATED')).toHaveLength(2);
    expect((await notifications.list(f.internal.id,{})).items.some(row=>row.type==='OPPORTUNITY_CREATED')).toBe(true);
  });
});
