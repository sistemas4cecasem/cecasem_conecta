import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { INestApplication, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
import { CommunicationsService } from '../src/modules/communications/communications.service';
import { CommunicationAmendmentsService } from '../src/modules/communications/communication-amendments.service';
import { RelationshipProcessesService } from '../src/modules/relationships/relationship-processes.service';
import { TranslationProvider, TranslationError } from '../src/modules/translation/translation-provider';
import { UserRole } from '../src/generated/prisma/client';
import { PermissionsGuard } from '../src/modules/auth/authorization/permissions.guard';
import type { AuthenticatedRequest } from '../src/modules/auth/session.guard';
const databaseUrl=validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Traducción requiere base aislada _test.');
describe('4.7 traducción PostgreSQL/HTTP',()=>{
  let app:INestApplication<Server>,prisma:PrismaService;
  const ids:string[]=[],orgs:string[]=[],accounts:string[]=[];
  const fake={name:'FakeTranslationProvider',translate:jest.fn<ReturnType<TranslationProvider['translate']>, Parameters<TranslationProvider['translate']>>()};
  const realGuard=new PermissionsGuard(new Reflector());
  const permissionBoundary={canActivate:(context:ExecutionContext)=>realGuard.canActivate(context)};
  beforeAll(async()=>{
    const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({NODE_ENV:'test',DATABASE_URL:databaseUrl})))
      .overrideProvider(TranslationProvider).useValue(fake).overrideGuard(PermissionsGuard).useValue(permissionBoundary).compile();
    app=module.createNestApplication<INestApplication<Server>>();configureApplication(app);await app.init();prisma=app.get(PrismaService);
  });
  beforeEach(()=>{fake.translate.mockReset().mockResolvedValue({translatedText:'Cooperación institucional',detectedSourceLanguage:'en'});});
  afterEach(async()=>{
    jest.restoreAllMocks();
    await prisma.$transaction([
      prisma.communicationTranslation.deleteMany({where:{communication:{registeredByUserId:{in:ids}}}}),
      prisma.auditEvent.deleteMany({where:{actorUserId:{in:ids}}}),
      prisma.communicationAmendment.deleteMany({where:{communication:{registeredByUserId:{in:ids}}}}),
      prisma.communicationRecipient.deleteMany({where:{communication:{registeredByUserId:{in:ids}}}}),
      prisma.communication.deleteMany({where:{registeredByUserId:{in:ids}}}),
      prisma.relationshipProcessEvent.deleteMany({where:{actorUserId:{in:ids}}}),
      prisma.processParticipant.deleteMany({where:{process:{createdByUserId:{in:ids}}}}),
      prisma.relationshipProcess.deleteMany({where:{createdByUserId:{in:ids}}}),
      prisma.organization.deleteMany({where:{id:{in:orgs}}}),
      prisma.userSession.deleteMany({where:{userId:{in:ids}}}),prisma.userEmailAccount.deleteMany({where:{userId:{in:ids}}}),
      prisma.emailAccount.deleteMany({where:{id:{in:accounts}}}),prisma.user.deleteMany({where:{id:{in:ids}}}),
    ]);ids.length=orgs.length=accounts.length=0;
  });
  afterAll(async()=>app.close());
  async function actor(role:UserRole=UserRole.RESEARCH){
    const row=await app.get(UsersService).createIdentity({givenNames:'Traducción',familyNames:'QA',role,email:randomUUID()+'@example.test'});ids.push(row.id);
    const token=await prisma.$transaction(tx=>app.get(SessionsService).create(row.id,tx));return {...row,cookie:'cecasem_session='+token};
  }
  async function fixture(){
    const owner=await actor();const org=await prisma.organization.create({data:{name:'Institución traducción QA'}});orgs.push(org.id);
    const process=await app.get(RelationshipProcessesService).create({organizationId:org.id,purpose:'Cooperación'},owner.id);
    const comm=await app.get(CommunicationsService).registerReceived(process.id,{sender:'institution@example.test',to:['cecasem@example.test'],cc:[],bcc:[],subject:'Proposal',body:'Institutional cooperation\n<script>literal</script>',receivedAt:'2000-01-01T00:00:00Z'},owner.id,randomUUID());
    return {owner,process,comm};
  }
  const path=(id:string)=>'/api/v1/communications/'+id+'/translations/spanish';
  const post=(id:string,cookie:string)=>request(app.getHttpServer()).post(path(id)).set('Cookie',cookie);
  async function snapshot(f:Awaited<ReturnType<typeof fixture>>){
    return {communication:await prisma.communication.findUnique({where:{id:f.comm.id}}),recipients:await prisma.communicationRecipient.findMany({where:{communicationId:f.comm.id}}),
      process:await prisma.relationshipProcess.findUnique({where:{id:f.process.id}}),participants:await prisma.processParticipant.findMany({where:{processId:f.process.id}}),
      events:await prisma.relationshipProcessEvent.count({where:{processId:f.process.id}}),amendments:await prisma.communicationAmendment.count({where:{communicationId:f.comm.id}}),
      audit:await prisma.auditEvent.count({where:{actorUserId:{in:ids}}}),notifications:await prisma.notification.count({where:{recipientUserId:{in:ids}}}),reminders:await prisma.reminderOccurrence.count({where:{processId:f.process.id}})};
  }
  it.each(Object.values(UserRole))('%s solicita y consulta representación sin efectos laterales',async role=>{
    const f=await fixture(),reader=await actor(role),before=await snapshot(f);
    const empty=await request(app.getHttpServer()).get(path(f.comm.id)).set('Cookie',reader.cookie).expect(200);expect(empty.body).toBeNull();expect(fake.translate).not.toHaveBeenCalled();
    const result=await post(f.comm.id,reader.cookie).expect(200);expect(result.body).toMatchObject({communicationId:f.comm.id,targetLanguage:'es',translatedText:'Cooperación institucional',detectedSourceLanguage:'en'});
    expect(fake.translate).toHaveBeenCalledWith({text:f.comm.bodyOriginal,sourceLanguage:'auto',targetLanguage:'es'});
    expect(await snapshot(f)).toEqual(before);expect(await prisma.processParticipant.count({where:{processId:f.process.id,userId:reader.id}})).toBe(0);
    const loaded=await request(app.getHttpServer()).get(path(f.comm.id)).set('Cookie',f.owner.cookie).expect(200);expect(loaded.body).toEqual(result.body);
    fake.translate.mockRejectedValue(new TranslationError('TRANSLATION_UNAVAILABLE'));expect((await post(f.comm.id,f.owner.cookie).expect(200)).body).toEqual(result.body);expect(fake.translate).toHaveBeenCalledTimes(1);
  });
  it('dos respuestas simultáneas comparten una fila y fingerprint original',async()=>{
    const f=await fixture(),reader=await actor();let count=0;let release!:()=>void;const barrier=new Promise<void>(resolve=>release=resolve);
    fake.translate.mockImplementation(async()=>{if(++count===2)release();await barrier;return {translatedText:'Traducción '+count};});
    const [a,b]=await Promise.all([post(f.comm.id,f.owner.cookie),post(f.comm.id,reader.cookie)]);expect(a.status).toBe(200);expect(b.status).toBe(200);expect(a.body).toEqual(b.body);
    const rows=await prisma.communicationTranslation.findMany({where:{communicationId:f.comm.id}});expect(rows).toHaveLength(1);
    expect(rows[0].sourceFingerprint).toBe((await prisma.communication.findUniqueOrThrow({where:{id:f.comm.id}})).requestFingerprint);
  });
  it('también traduce SENT consolidada sin cambiar original ni cuenta',async()=>{
    const f=await fixture(),users=app.get(UsersService);const account=await users.createEmailAccount({address:randomUUID()+'@example.test',displayName:'Cuenta QA'});accounts.push(account.id);await users.assignEmailAccount(f.owner.id,account.id);
    const comm=await app.get(CommunicationsService).registerSent(f.process.id,{emailAccountId:account.id,to:['partner@example.test'],cc:[],bcc:[],subject:'Proposal',body:'Institutional cooperation',sentAt:'2000-01-01T00:00:00Z'},f.owner.id,randomUUID());const before=await prisma.communication.findUnique({where:{id:comm.id}});
    await post(comm.id,f.owner.cookie).expect(200);expect(await prisma.communication.findUnique({where:{id:comm.id}})).toEqual(before);expect(await prisma.communicationTranslation.findFirst({where:{communicationId:comm.id}})).toHaveProperty('provider','FakeTranslationProvider');
  });
  it.each([['TRANSLATION_UNAVAILABLE',503],['TRANSLATION_TIMEOUT',504],['TRANSLATION_PROVIDER_ERROR',503]] as const)('fallo %s no bloquea original ni reintento',async(code,status)=>{
    const f=await fixture(),before=await snapshot(f);fake.translate.mockRejectedValue(new TranslationError(code));
    const result=await post(f.comm.id,f.owner.cookie).expect(status);expect(result.body).toHaveProperty('code',code);expect(JSON.stringify(result.body)).not.toContain(f.comm.bodyOriginal);
    expect(await snapshot(f)).toEqual(before);expect(await prisma.communicationTranslation.count({where:{communicationId:f.comm.id}})).toBe(0);
    const original=await request(app.getHttpServer()).get('/api/v1/communications/'+f.comm.id).set('Cookie',f.owner.cookie).expect(200);expect(original.body).toHaveProperty('bodyOriginal',f.comm.bodyOriginal);
    fake.translate.mockResolvedValue({translatedText:'Cooperación'});await post(f.comm.id,f.owner.cookie).expect(200);
  });
  it('invalidada y amendments permanecen separados y consultables',async()=>{
    const f=await fixture();await app.get(CommunicationAmendmentsService).create(f.comm.id,'CORRECTION','Corrección posterior',f.owner.id,randomUUID());
    await app.get(CommunicationAmendmentsService).create(f.comm.id,'INVALIDATION','Duplicada',f.owner.id,randomUUID());const before=await snapshot(f);
    await post(f.comm.id,f.owner.cookie).expect(200);expect(fake.translate).toHaveBeenCalledWith(expect.objectContaining({text:f.comm.bodyOriginal}));expect(await snapshot(f)).toEqual(before);
    await request(app.getHttpServer()).get(path(f.comm.id)).set('Cookie',f.owner.cookie).expect(200);
  });
  it('401 anónimo, sesión revocada e inactivo; inexistente 404',async()=>{
    const f=await fixture();await request(app.getHttpServer()).post(path(f.comm.id)).expect(401);await post(randomUUID(),f.owner.cookie).expect(404);
    await prisma.userSession.updateMany({where:{userId:f.owner.id},data:{revokedAt:new Date()}});await post(f.comm.id,f.owner.cookie).expect(401);
    const reader=await actor();await prisma.user.update({where:{id:reader.id},data:{isActive:false,deactivatedAt:new Date()}});await post(f.comm.id,reader.cookie).expect(401);expect(fake.translate).not.toHaveBeenCalled();
  });
  it('revalida usuario desactivado mientras espera proveedor y no persiste',async()=>{
    const f=await fixture();fake.translate.mockImplementation(async()=>{await prisma.user.update({where:{id:f.owner.id},data:{isActive:false,deactivatedAt:new Date()}});return {translatedText:'Texto'};});await post(f.comm.id,f.owner.cookie).expect(403);expect(await prisma.communicationTranslation.count({where:{communicationId:f.comm.id}})).toBe(0);
  });
  it('rol sin capabilities efectivas impide consulta y solicitud en el guard real',async()=>{
    const f=await fixture(),guard=permissionBoundary,original=guard.canActivate.bind(guard);
    // Los cuatro roles vigentes tienen ambas capabilities. Se simula un rol desconocido
    // en el límite HTTP para comprobar el rechazo cerrado del guard, sin alterar RBAC.
    jest.spyOn(guard,'canActivate').mockImplementation(context=>{context.switchToHttp().getRequest<AuthenticatedRequest>().authenticatedUser.role='UNRECOGNIZED' as UserRole;return original(context);});
    await post(f.comm.id,f.owner.cookie).expect(403);await request(app.getHttpServer()).get(path(f.comm.id)).set('Cookie',f.owner.cookie).expect(403);expect(fake.translate).not.toHaveBeenCalled();
  });
  it('fuente sin texto significativo devuelve 422 sin llamar al provider',async()=>{
    const f=await fixture(),source=await prisma.communication.findUniqueOrThrow({where:{id:f.comm.id}});
    jest.spyOn(app.get(CommunicationsService),'translationSource').mockResolvedValue({id:f.comm.id,bodyOriginal:' \n',requestFingerprint:source.requestFingerprint,direction:'RECEIVED'});
    const result=await post(f.comm.id,f.owner.cookie).expect(422);expect(result.body).toHaveProperty('code','TRANSLATION_EMPTY_BODY');expect(fake.translate).not.toHaveBeenCalled();
  });
  it('constraints protegen FK, idioma, fingerprint, unicidad y procedencia',async()=>{
    const f=await fixture();const source=await prisma.communication.findUniqueOrThrow({where:{id:f.comm.id}});
    const data={communicationId:f.comm.id,targetLanguage:'es',sourceFingerprint:source.requestFingerprint,translatedText:'Texto español',provider:'LibreTranslate',requestedByUserId:f.owner.id};
    for(const change of [{communicationId:randomUUID()},{requestedByUserId:randomUUID()},{targetLanguage:'en'},{sourceFingerprint:'a'.repeat(64)},{translatedText:''}])await expect(prisma.communicationTranslation.create({data:{...data,...change}})).rejects.toThrow();
    const row=await prisma.communicationTranslation.create({data});await expect(prisma.communicationTranslation.create({data})).rejects.toThrow();await expect(prisma.communicationTranslation.update({where:{id:row.id},data:{translatedText:'Otra'}})).rejects.toThrow();
    await expect(prisma.$transaction(async tx=>{await tx.communicationTranslation.delete({where:{id:row.id}});throw new Error('Rollback');})).rejects.toThrow('Rollback');expect(await prisma.communicationTranslation.findUnique({where:{id:row.id}})).not.toBeNull();
  });
});
