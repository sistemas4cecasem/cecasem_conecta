import { type INestApplication,Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes,randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { AuditAction,ContactType,UserRole,Prisma } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { PasswordService } from '../src/modules/auth/password.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { DirectoryService } from '../src/modules/directory/directory.service';
import { PeopleService } from '../src/modules/directory/people.service';
import { ContactsService } from '../src/modules/directory/contacts.service';
import { DirectoryHistoryService } from '../src/modules/directory/directory-history.service';
import { AuditService } from '../src/modules/audit/audit.service';

const databaseUrl=validateDatabaseUrl(process.env.DATABASE_URL);
if(!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Personas requiere una base aislada _test.');
function barrier(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});return {promise,release};}
type ContextualPersonResponse={person:{id:string;displayName:string;givenNames:string|null;familyNames:string|null;currentRelationsCount:number;institutionalStatus:string;lastVerifiedAt:string|null};
  relation:{id:string;personId:string;organizationId:string;isCurrent:boolean;positionTitle:string|null;area:string|null;lastVerifiedAt:string|null}};
type PeoplePageResponse={total:number;items:Array<{id:string;institutionalStatus:string}>};
describe('Personas PostgreSQL y HTTP',()=>{
  let app:INestApplication<Server>,prisma:PrismaService,users:UsersService,directory:DirectoryService,people:PeopleService,contacts:ContactsService,history:DirectoryHistoryService,audit:AuditService,passwordHash:string;
  const password=randomBytes(24).toString('hex')+'Aa!';const userIds:string[]=[],personIds:string[]=[],organizationIds:string[]=[],contactMethodIds:string[]=[];
  beforeAll(async()=>{
    const moduleRef=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(ConfigService).useValue(new ConfigService(validateEnvironment({NODE_ENV:'test',DATABASE_URL:databaseUrl}))).compile();
    app=moduleRef.createNestApplication<INestApplication<Server>>();configureApplication(app);await app.init();
    prisma=app.get(PrismaService);users=app.get(UsersService);directory=app.get(DirectoryService);people=app.get(PeopleService);contacts=app.get(ContactsService);history=app.get(DirectoryHistoryService);audit=app.get(AuditService);
    passwordHash=await app.get(PasswordService).hashNew(password);
  });
  afterEach(async()=>{
    jest.restoreAllMocks();await prisma.$transaction([
      prisma.auditEvent.deleteMany({where:{actorUserId:{in:userIds}}}),prisma.directoryChange.deleteMany({where:{actorUserId:{in:userIds}}}),
      prisma.person.updateMany({where:{id:{in:personIds}},data:{duplicateOfId:null}}),
      prisma.personContact.deleteMany({where:{personId:{in:personIds}}}),prisma.contactMethod.deleteMany({where:{id:{in:contactMethodIds}}}),
      prisma.personOrganizationRelation.deleteMany({where:{OR:[{personId:{in:personIds}},{organizationId:{in:organizationIds}}]}}),prisma.person.deleteMany({where:{id:{in:personIds}}}),
      prisma.organization.deleteMany({where:{id:{in:organizationIds}}}),prisma.userSession.deleteMany({where:{userId:{in:userIds}}}),prisma.user.deleteMany({where:{id:{in:userIds}}}),
    ]);userIds.length=0;personIds.length=0;organizationIds.length=0;contactMethodIds.length=0;
  });
  afterAll(async()=>{await app.close();});
  async function fixture(role:UserRole=UserRole.ADMINISTRATOR){const actor=await users.createIdentity({givenNames:'QA',familyNames:randomUUID(),email:randomUUID()+'@example.test',role});userIds.push(actor.id);await prisma.user.update({where:{id:actor.id},data:{passwordHash}});return actor;}
  async function person(actorId:string,name='Ana'){const row=await people.create({displayName:name},actorId);personIds.push(row.id);return row;}
  async function org(actorId:string,name='Institución'){const row=await directory.createOrganization({name},actorId);organizationIds.push(row.id);return row;}
  async function cookie(actor:{email:string}){const result=await request(app.getHttpServer()).post('/api/v1/auth/login').send({email:actor.email,password}).expect(200);return (result.headers['set-cookie'] as unknown as string[])[0].split(';')[0];}
  const routes=[['get','people'],['get','people/ID'],['post','people'],['put','people/ID'],['patch','people/ID/status'],['get','people/ID/history'],['get','people/ID/relations'],['post','people/ID/relations'],['get','organizations/ID/people'],['post','organizations/ID/people'],['get','person-organization-relations/ID'],['put','person-organization-relations/ID'],['patch','person-organization-relations/ID/end'],['get','person-organization-relations/ID/history']] as const;
  it.each(routes)('anónimo %s %s recibe 401',async(method,path)=>{await request(app.getHttpServer())[method]('/api/v1/'+path.replace('ID',randomUUID())).expect(401);});
  it.each(routes)('sin capability %s %s recibe 403',async(method,path)=>{const actor=await fixture();jest.spyOn(app.get(SessionsService),'findIdentity').mockResolvedValue({...actor,role:'UNKNOWN' as UserRole});await request(app.getHttpServer())[method]('/api/v1/'+path.replace('ID',randomUUID())).set('Cookie','cecasem_session=fixture').expect(403);});
  it('crea una persona con su episodio en una transacción y devuelve ambas fichas e historiales',async()=>{
    const actor=await fixture(),auth=await cookie(actor),organization=await org(actor.id);await directory.organizationStatus(organization.id,{isActive:false,expectedVersion:1},actor.id);
    const created=await request(app.getHttpServer()).post('/api/v1/organizations/'+organization.id+'/people').set('Cookie',auth).send({
      personMode:'new',person:{displayName:'Ana contextual',givenNames:'Ana',familyNames:'Pérez'},positionTitle:'Coordinadora',area:'Cooperación',isCurrent:true,startDate:'2024-01-15',sourceDescription:'Directorio público',sourceUrl:'https://example.test/persona',notes:'Alta contextual',
    }).expect(201);
    const body=created.body as ContextualPersonResponse,personId=body.person.id,relationId=body.relation.id;personIds.push(personId);
    expect(body.person).toMatchObject({displayName:'Ana contextual',givenNames:'Ana',familyNames:'Pérez',currentRelationsCount:1,institutionalStatus:'CURRENT',lastVerifiedAt:null});
    expect(body.person).not.toHaveProperty('relations');
    expect(body.relation).toMatchObject({personId,organizationId:organization.id,isCurrent:true,positionTitle:'Coordinadora',area:'Cooperación',lastVerifiedAt:null});
    expect((await people.personHistory(personId,{page:1,pageSize:25})).total).toBe(1);
    expect((await people.relationHistory(relationId,{page:1,pageSize:25})).total).toBe(1);
    expect((await people.get(personId)).institutionalStatus).toBe('CURRENT');
  });
  it('vincula una persona existente sin duplicarla y conserva episodios previos',async()=>{
    const actor=await fixture(),auth=await cookie(actor),source=await org(actor.id,'Institución anterior'),target=await org(actor.id,'Institución actual');
    const independent=await person(actor.id,'Persona antes independiente');personIds.push(independent.id);
    const first=await request(app.getHttpServer()).post('/api/v1/organizations/'+target.id+'/people').set('Cookie',auth).send({
      personMode:'existing',personId:independent.id,positionTitle:'Consultora',isCurrent:true,
    }).expect(201);
    const firstBody=first.body as ContextualPersonResponse;
    expect(firstBody.person.id).toBe(independent.id);expect(firstBody.person.currentRelationsCount).toBe(1);
    expect(await prisma.person.count({where:{id:independent.id}})).toBe(1);
    const withHistory=await person(actor.id,'Persona con historia');personIds.push(withHistory.id);
    const existingContact=await contacts.createAndAssociate({personId:withHistory.id},{type:ContactType.EMAIL,value:randomUUID()+'@example.test',notes:'Contacto personal conservado'},actor.id);
    contactMethodIds.push(existingContact.association.contactMethodId);
    const old=await people.createRelation(withHistory.id,{organizationId:source.id,positionTitle:'Asesora',isCurrent:false,startDate:'2020-01-01',endDate:'2022-06-30'},actor.id);
    const linked=await request(app.getHttpServer()).post('/api/v1/organizations/'+target.id+'/people').set('Cookie',auth).send({
      personMode:'existing',personId:withHistory.id,positionTitle:'Directora',isCurrent:true,
    }).expect(201);
    const linkedBody=linked.body as ContextualPersonResponse;
    expect(linkedBody.person).toMatchObject({id:withHistory.id,currentRelationsCount:1,institutionalStatus:'CURRENT'});
    expect(await prisma.person.count({where:{id:withHistory.id}})).toBe(1);
    expect(await prisma.personOrganizationRelation.count({where:{personId:withHistory.id}})).toBe(2);
    expect(await people.getRelation(old.id)).toMatchObject({organizationId:source.id,isCurrent:false,positionTitle:'Asesora'});
    expect(linkedBody.relation.organizationId).toBe(target.id);
    expect(await prisma.personContact.count({where:{personId:withHistory.id}})).toBe(1);
    expect((await contacts.listActor({personId:withHistory.id},{page:1,pageSize:25})).items).toEqual(expect.arrayContaining([
      expect.objectContaining({id:existingContact.association.id,contactMethodId:existingContact.association.contactMethodId,notes:'Contacto personal conservado'}),
    ]));
  });
  it('rollback contextual si falla el episodio o una escritura de historial',async()=>{
    const actor=await fixture(),auth=await cookie(actor),organization=await org(actor.id);
    for(const failure of ['episode','history'] as const) {
      const displayName='Rollback contextual '+failure+' '+randomUUID();
      if(failure==='episode') {
        await prisma.$executeRaw`CREATE OR REPLACE FUNCTION reject_contextual_relation_for_test() RETURNS trigger AS $$
          BEGIN RAISE EXCEPTION 'fixture episode failure'; END; $$ LANGUAGE plpgsql`;
        await prisma.$executeRaw`CREATE TRIGGER reject_contextual_relation_for_test BEFORE INSERT ON "PersonOrganizationRelation"
          FOR EACH ROW EXECUTE FUNCTION reject_contextual_relation_for_test()`;
      }
      else {
        await prisma.$executeRaw`CREATE OR REPLACE FUNCTION reject_contextual_history_for_test() RETURNS trigger AS $$
          BEGIN RAISE EXCEPTION 'fixture history failure'; END; $$ LANGUAGE plpgsql`;
        await prisma.$executeRaw`CREATE TRIGGER reject_contextual_history_for_test BEFORE INSERT ON "DirectoryChange"
          FOR EACH ROW WHEN (NEW."personRelationId" IS NOT NULL) EXECUTE FUNCTION reject_contextual_history_for_test()`;
      }
      jest.spyOn(Logger.prototype,'error').mockImplementation(()=>undefined);
      let response:request.Response;
      try {
        response=await request(app.getHttpServer()).post('/api/v1/organizations/'+organization.id+'/people').set('Cookie',auth).send({personMode:'new',person:{displayName,givenNames:'Prueba'},isCurrent:true});
      } finally {
        if(failure==='episode') {
          await prisma.$executeRaw`DROP TRIGGER reject_contextual_relation_for_test ON "PersonOrganizationRelation"`;
          await prisma.$executeRaw`DROP FUNCTION reject_contextual_relation_for_test()`;
        } else {
          await prisma.$executeRaw`DROP TRIGGER reject_contextual_history_for_test ON "DirectoryChange"`;
          await prisma.$executeRaw`DROP FUNCTION reject_contextual_history_for_test()`;
        }
      }
      const persisted=await prisma.person.findMany({where:{displayName},select:{id:true}});personIds.push(...persisted.map(row=>row.id));
      expect(response.status).toBe(500);
      expect(persisted).toHaveLength(0);
      jest.restoreAllMocks();
    }
  });
  it('rechaza contexto inexistente, persona inexistente o consolidada y organización enviada en el cuerpo',async()=>{
    const actor=await fixture(),auth=await cookie(actor),organization=await org(actor.id);
    await request(app.getHttpServer()).post('/api/v1/organizations/'+randomUUID()+'/people').set('Cookie',auth).send({personMode:'new',person:{displayName:'No debe crearse'}}).expect(404);
    await request(app.getHttpServer()).post('/api/v1/organizations/'+organization.id+'/people').set('Cookie',auth).send({personMode:'existing',personId:randomUUID()}).expect(404);
    await request(app.getHttpServer()).post('/api/v1/organizations/'+organization.id+'/people').set('Cookie',auth).send({personMode:'new',person:{displayName:'No debe seleccionar organización'},organizationId:organization.id}).expect(400);
    const principal=await person(actor.id,'Principal consolidación'),duplicate=await person(actor.id,'Duplicada consolidación');personIds.push(principal.id,duplicate.id);
    await prisma.person.update({where:{id:duplicate.id},data:{duplicateOfId:principal.id,isActive:false}});
    await request(app.getHttpServer()).post('/api/v1/organizations/'+organization.id+'/people').set('Cookie',auth).send({personMode:'existing',personId:duplicate.id}).expect(409);
    expect(await prisma.personOrganizationRelation.count({where:{personId:duplicate.id}})).toBe(0);
  });
  it('clasifica personas y filtra en base de datos combinando estado, nombre y paginación',async()=>{
    const actor=await fixture(),auth=await cookie(actor),prefix='Estado '+randomUUID(),a=await org(actor.id,'Organización de estado A'),b=await org(actor.id,'Organización de estado B');
    const noLinks=await person(actor.id,prefix+' sin episodios'),historical=await person(actor.id,prefix+' históricos'),current=await person(actor.id,prefix+' vigentes'),mixed=await person(actor.id,prefix+' mixtos'),inactiveOrganization=await org(actor.id,prefix+' inactiva'),inactiveCurrent=await person(actor.id,prefix+' organización inactiva');
    personIds.push(noLinks.id,historical.id,current.id,mixed.id,inactiveCurrent.id);
    await people.createRelation(historical.id,{organizationId:a.id,isCurrent:false},actor.id);
    const currentA=await people.createRelation(current.id,{organizationId:a.id,isCurrent:true},actor.id),currentB=await people.createRelation(current.id,{organizationId:b.id,isCurrent:true},actor.id);
    await people.createRelation(mixed.id,{organizationId:a.id,isCurrent:false},actor.id);await people.createRelation(mixed.id,{organizationId:b.id,isCurrent:true},actor.id);
    await directory.organizationStatus(inactiveOrganization.id,{isActive:false,expectedVersion:1},actor.id);
    await people.createRelation(inactiveCurrent.id,{organizationId:inactiveOrganization.id,isCurrent:true},actor.id);
    const query=async(filter:string,page=1,pageSize=25)=>{const response=await request(app.getHttpServer()).get('/api/v1/people').query({name:prefix,status:'all',institutionalStatus:filter,page,pageSize}).set('Cookie',auth).expect(200);return response.body as PeoplePageResponse;};
    const all=await query('all');expect(all.total).toBe(5);
    const legacy=await request(app.getHttpServer()).get('/api/v1/people').query({name:prefix,status:'all'}).set('Cookie',auth).expect(200);
    expect((legacy.body as PeoplePageResponse).total).toBe(5);
    expect(Object.fromEntries(all.items.map(row=>[row.id,row.institutionalStatus]))).toEqual({
      [noLinks.id]:'NO_KNOWN_LINKS',[historical.id]:'HISTORICAL_ONLY',[current.id]:'CURRENT',[mixed.id]:'CURRENT',[inactiveCurrent.id]:'CURRENT',
    });
    expect((await query('without-current')).total).toBe(2);expect((await query('none')).total).toBe(1);
    expect((await query('historical-only')).total).toBe(1);expect((await query('current')).total).toBe(3);
    const first=await query('current',1,1),second=await query('current',2,1),third=await query('current',3,1);
    expect([first.total,second.total,third.total]).toEqual([3,3,3]);
    expect(new Set([first.items[0].id,second.items[0].id,third.items[0].id]).size).toBe(3);
    await people.status(current.id,{isActive:false,expectedVersion:1},actor.id);
    const active=await request(app.getHttpServer()).get('/api/v1/people').query({name:prefix,status:'active',institutionalStatus:'current'}).set('Cookie',auth).expect(200);
    const inactive=await request(app.getHttpServer()).get('/api/v1/people').query({name:prefix,status:'inactive',institutionalStatus:'current'}).set('Cookie',auth).expect(200);
    expect((active.body as PeoplePageResponse).total).toBe(2);expect((inactive.body as PeoplePageResponse).total).toBe(1);
    await people.endRelation(currentA.id,{expectedVersion:1},actor.id);
    expect((await people.get(current.id)).institutionalStatus).toBe('CURRENT');
    await people.endRelation(currentB.id,{expectedVersion:1},actor.id);
    expect((await people.get(current.id)).institutionalStatus).toBe('HISTORICAL_ONLY');
  });
  it.each(Object.values(UserRole))('%s registra, corrige y finaliza; estado administrativo restringido',async role=>{
    const actor=await fixture(role),auth=await cookie(actor),organization=await org(actor.id);
    const created=await request(app.getHttpServer()).post('/api/v1/people').set('Cookie',auth).send({displayName:'  Ana   conocida '}).expect(201);
    const row=created.body as {id:string};personIds.push(row.id);
    expect(created.body).toMatchObject({displayName:'Ana conocida',givenNames:null,familyNames:null,currentRelationsCount:0,lastVerifiedAt:null,version:1});expect(created.body).not.toHaveProperty('_count');expect(created.body).not.toHaveProperty('organizationId');
    await request(app.getHttpServer()).put('/api/v1/people/'+row.id).set('Cookie',auth).send({displayName:'Ana corregida',expectedVersion:1}).expect(200);
    const relation=await request(app.getHttpServer()).post('/api/v1/people/'+row.id+'/relations').set('Cookie',auth).send({organizationId:organization.id,positionTitle:'Coordinador'}).expect(201);
    const episode=relation.body as {id:string};
    await request(app.getHttpServer()).put('/api/v1/person-organization-relations/'+episode.id).set('Cookie',auth).send({positionTitle:'Coordinadora',isCurrent:true,expectedVersion:1}).expect(200);
    await request(app.getHttpServer()).patch('/api/v1/person-organization-relations/'+episode.id+'/end').set('Cookie',auth).send({expectedVersion:2}).expect(200);
    for(const path of ['people','people/'+row.id,'people/'+row.id+'/history','people/'+row.id+'/relations','organizations/'+organization.id+'/people','person-organization-relations/'+episode.id,'person-organization-relations/'+episode.id+'/history']) await request(app.getHttpServer()).get('/api/v1/'+path).set('Cookie',auth).expect(200);
    await request(app.getHttpServer()).patch('/api/v1/people/'+row.id+'/status').set('Cookie',auth).send({isActive:false,expectedVersion:2}).expect(role===UserRole.ADMINISTRATOR?200:403);
    expect((await people.get(row.id)).lastVerifiedAt).toBeNull();
  });
  it.each([{}, {displayName:''},{displayName:12},{displayName:'x'.repeat(251)},{displayName:'Ana',organizationId:randomUUID()},{displayName:'Ana',email:'external@example.test'},{displayName:'Ana',lastVerifiedAt:'2026-01-01'},{displayName:'Ana',isActive:false}])('persona inválida %j →400',async body=>{const auth=await cookie(await fixture());await request(app.getHttpServer()).post('/api/v1/people').set('Cookie',auth).send(body).expect(400);});
  it.each([{startDate:'2024'},{startDate:'2024-02-30'},{isCurrent:true,endDate:'2024-01-01'},{isCurrent:false,startDate:'2025-01-01',endDate:'2024-01-01'},{sourceUrl:'javascript:alert(1)'},{organizationId:'invalid'},{personId:randomUUID()},{positionTitle:'x'.repeat(251)}])('episodio inválido %j →400',async invalid=>{
    const actor=await fixture(),auth=await cookie(actor),row=await person(actor.id),organization=await org(actor.id);
    await request(app.getHttpServer()).post('/api/v1/people/'+row.id+'/relations').set('Cookie',auth).send({organizationId:organization.id,...invalid}).expect(400);
  });
  it('dos organizaciones simultáneas, fin desconocido y regreso con cargo nuevo conservan los tres episodios',async()=>{
    const actor=await fixture(),row=await person(actor.id),a=await org(actor.id,'A'),b=await org(actor.id,'B');
    const first=await people.createRelation(row.id,{organizationId:a.id,positionTitle:'Coordinadora',isCurrent:true},actor.id);
    await people.createRelation(row.id,{organizationId:b.id,positionTitle:'Consultora',isCurrent:true},actor.id);
    expect((await people.get(row.id)).currentRelationsCount).toBe(2);
    await people.endRelation(first.id,{expectedVersion:1},actor.id);
    const later=await people.createRelation(row.id,{organizationId:a.id,positionTitle:'Directora',isCurrent:true},actor.id);
    expect(later.id).not.toBe(first.id);expect((await people.getRelation(first.id))).toMatchObject({positionTitle:'Coordinadora',isCurrent:false,endDate:null});
    expect((await people.relationsOfPerson(row.id,{page:1,pageSize:25,status:'all'})).total).toBe(3);
    expect((await people.relationsOfOrganization(a.id,{page:1,pageSize:25,status:'historical'})).total).toBe(1);
    await directory.organizationStatus(a.id,{isActive:false,expectedVersion:1},actor.id);await people.status(row.id,{isActive:false,expectedVersion:1},actor.id);
    expect(await prisma.personOrganizationRelation.count()).toBe(3);expect((await people.getRelation(first.id)).organization.isActive).toBe(false);
  });
  it('edición persona y corrección episodio conservan autores/valores/operación, fechas de creación y verificación',async()=>{
    const actor=await fixture(),row=await person(actor.id),organization=await org(actor.id);
    await people.edit(row.id,{displayName:'Ana Pérez',givenNames:'Ana',familyNames:'Pérez',expectedVersion:1},actor.id);
    expect(await people.get(row.id)).toMatchObject({createdAt:row.createdAt,lastVerifiedAt:null,version:2});
    const episode=await people.createRelation(row.id,{organizationId:organization.id,isCurrent:true,positionTitle:'Coordinador'},actor.id);
    await people.editRelation(episode.id,{positionTitle:'Coordinadora',area:'Cooperación',isCurrent:true,startDate:'2024-02-29',sourceDescription:'Documento público',sourceUrl:'https://example.test/fuente',notes:'Corrección',expectedVersion:1},actor.id);
    const changes=await people.relationHistory(episode.id,{page:1,pageSize:25});expect(changes.total).toBe(2);expect(changes.items[0].changes).toHaveLength(6);
    expect(new Set(changes.items.map(change=>change.operationId)).size).toBe(2);
    expect(changes.items[0].actor).toMatchObject({id:actor.id});expect(changes.items[0].changes.find(change=>change.field==='positionTitle')).toMatchObject({previousValue:'Coordinador',newValue:'Coordinadora'});
    expect(await prisma.auditEvent.findFirst({where:{personRelationId:episode.id}})).toMatchObject({action:AuditAction.PERSON_RELATION_UPDATED,operationId:changes.items[0].operationId,actorUserId:actor.id,targetUserId:null});
    expect((await people.getRelation(episode.id)).createdAt).toEqual(episode.createdAt);
  });
  it.each(['person-history','person-audit','relation-history','relation-audit'])('rollback completo ante fallo %s',async kind=>{
    const actor=await fixture(),row=await person(actor.id),organization=await org(actor.id),episode=await people.createRelation(row.id,{organizationId:organization.id,isCurrent:true},actor.id);
    const personBefore=await people.get(row.id);const historyBefore=await prisma.directoryChange.count();
    if(kind.endsWith('history'))jest.spyOn(history,'record').mockRejectedValueOnce(new Error('fixture'));else jest.spyOn(audit,'recordDirectory').mockRejectedValueOnce(new Error('fixture'));
    await expect(kind.startsWith('person-')?people.edit(row.id,{displayName:'No confirma',expectedVersion:1},actor.id):people.editRelation(episode.id,{positionTitle:'No confirma',isCurrent:true,expectedVersion:1},actor.id)).rejects.toThrow();
    expect(await people.get(row.id)).toEqual(personBefore);expect(await people.getRelation(episode.id)).toEqual(episode);expect(await prisma.directoryChange.count()).toBe(historyBefore);expect(await prisma.auditEvent.count()).toBe(0);
  });
  it('finalización repetida con versión vigente es no-op; versión vieja y fecha anterior producen 409/400',async()=>{
    const actor=await fixture(),auth=await cookie(actor),row=await person(actor.id),organization=await org(actor.id),episode=await people.createRelation(row.id,{organizationId:organization.id,isCurrent:true,startDate:'2024-01-01'},actor.id);
    const path='/api/v1/person-organization-relations/'+episode.id+'/end';
    await request(app.getHttpServer()).patch(path).set('Cookie',auth).send({expectedVersion:1,endDate:'2023-12-31'}).expect(400);
    const result=await request(app.getHttpServer()).patch(path).set('Cookie',auth).send({expectedVersion:1,endDate:'2025-01-01'}).expect(200);
    const repeated=await request(app.getHttpServer()).patch(path).set('Cookie',auth).send({expectedVersion:2,endDate:'2026-01-01'}).expect(200);
    expect(repeated.body).toEqual(result.body);expect(await prisma.auditEvent.count()).toBe(1);
    await request(app.getHttpServer()).patch(path).set('Cookie',auth).send({expectedVersion:1}).expect(409);
  });
  it('404 para persona, organización y vínculo ausentes; paginación/orden deterministas; no existe borrado',async()=>{
    const actor=await fixture(),auth=await cookie(actor),row=await person(actor.id,'Igual'),other=await person(actor.id,'Igual');
    const list=await request(app.getHttpServer()).get('/api/v1/people?pageSize=1').set('Cookie',auth).expect(200);expect(list.body).toMatchObject({total:2,items:[{id:[row.id,other.id].sort()[0]}]});
    for(const path of ['people/'+randomUUID(),'person-organization-relations/'+randomUUID(),'organizations/'+randomUUID()+'/people'])await request(app.getHttpServer()).get('/api/v1/'+path).set('Cookie',auth).expect(404);
    await request(app.getHttpServer()).post('/api/v1/people/'+row.id+'/relations').set('Cookie',auth).send({organizationId:randomUUID()}).expect(404);
    await request(app.getHttpServer()).post('/api/v1/people/'+randomUUID()+'/relations').set('Cookie',auth).send({organizationId:randomUUID()}).expect(404);
    for(const path of ['people?pageSize=101','people?page=0','people?email=unknown'])await request(app.getHttpServer()).get('/api/v1/'+path).set('Cookie',auth).expect(400);
    await request(app.getHttpServer()).delete('/api/v1/people/'+row.id).set('Cookie',auth).expect(404);
  });
  it('dos escrituras concurrentes de persona versión N confirman solo una',async()=>{
    const actor=await fixture(),row=await person(actor.id);const results=await Promise.allSettled([
      people.edit(row.id,{displayName:'Primera',expectedVersion:1},actor.id),people.edit(row.id,{displayName:'Segunda',expectedVersion:1},actor.id)]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(results.find(result=>result.status==='rejected')).toMatchObject({reason:{code:'VERSION_CONFLICT'}});expect(await prisma.directoryChange.count()).toBe(1);
  });
  it('barrera determinista: finalización concurrente impide corrección antigua',async()=>{
    const actor=await fixture(),row=await person(actor.id),organization=await org(actor.id),episode=await people.createRelation(row.id,{organizationId:organization.id,isCurrent:true},actor.id);
    const entered=barrier(),release=barrier(),queued=barrier();let calls=0;const original=people.lockRelation.bind(people);
    jest.spyOn(people,'lockRelation').mockImplementation(async(id,tx)=>{const order=++calls;if(order===2)queued.release();await original(id,tx);if(order===1){entered.release();await release.promise;}});
    const first=people.endRelation(episode.id,{expectedVersion:1},actor.id);await entered.promise;
    const second=people.editRelation(episode.id,{expectedVersion:1,isCurrent:true,positionTitle:'Antiguo'},actor.id);await queued.promise;release.release();
    const results=await Promise.allSettled([first,second]);expect(results[0].status).toBe('fulfilled');expect(results[1]).toMatchObject({status:'rejected',reason:{code:'VERSION_CONFLICT'}});expect((await people.getRelation(episode.id)).isCurrent).toBe(false);
  });
  it('SQL protege FK, fechas, versión y objetivos tipados del historial',async()=>{
    const actor=await fixture(),row=await person(actor.id),organization=await org(actor.id),episode=await people.createRelation(row.id,{organizationId:organization.id,isCurrent:true},actor.id);
    for(const data of [{personId:randomUUID()},{organizationId:randomUUID()},{version:0},{startDate:new Date('2025-01-01'),endDate:new Date('2024-01-01'),isCurrent:false},{endDate:new Date('2025-01-01'),isCurrent:true}])await expect(prisma.personOrganizationRelation.update({where:{id:episode.id},data})).rejects.toThrow();
    await expect(prisma.person.delete({where:{id:row.id}})).rejects.toThrow();await expect(prisma.organization.delete({where:{id:organization.id}})).rejects.toThrow();
    await expect(prisma.person.update({where:{id:row.id},data:{displayName:' '}})).rejects.toThrow();
    const valid={personRelationId:episode.id,actorUserId:actor.id,operationId:randomUUID(),field:'endDate',previousValue:Prisma.JsonNull,newValue:'2025-01-01'};
    await prisma.directoryChange.create({data:valid});
    for(const data of [{...valid,operationId:randomUUID(),personId:row.id},{...valid,operationId:randomUUID(),field:'email'},{...valid,operationId:randomUUID(),field:'isCurrent',newValue:'false'}])await expect(prisma.directoryChange.create({data})).rejects.toThrow();
  });
  it.each([AuditAction.PERSON_UPDATED,AuditAction.PERSON_STATUS_CHANGED,AuditAction.PERSON_RELATION_UPDATED,AuditAction.PERSON_RELATION_ENDED])('CHECK auditoría %s protege objetivo real y familias anteriores',async action=>{
    const actor=await fixture(),row=await person(actor.id),organization=await org(actor.id),episode=await people.createRelation(row.id,{organizationId:organization.id,isCurrent:true},actor.id);
    const target=action.startsWith('PERSON_RELATION')?{personRelationId:episode.id}:{personId:row.id};const valid={...target,action,actorUserId:actor.id,operationId:randomUUID()};await prisma.auditEvent.create({data:valid});
    for(const data of [{...valid,actorUserId:null},{...valid,operationId:null},{...valid,organizationId:organization.id},{...valid,targetUserId:actor.id},{...valid,personId:row.id,personRelationId:episode.id},{...valid,action:AuditAction.ORGANIZATION_UPDATED}])await expect(prisma.auditEvent.create({data})).rejects.toThrow();
  });
  it('actor desactivado o sin permiso vigente no puede operar directamente',async()=>{
    const actor=await fixture(),row=await person(actor.id);await prisma.user.update({where:{id:actor.id},data:{isActive:false,deactivatedAt:new Date()}});
    await expect(people.edit(row.id,{displayName:'No',expectedVersion:1},actor.id)).rejects.toMatchObject({code:'FORBIDDEN'});
    await prisma.user.update({where:{id:actor.id},data:{isActive:true,deactivatedAt:null,role:UserRole.RESEARCH}});
    await expect(people.status(row.id,{isActive:false,expectedVersion:1},actor.id)).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('500 seguro y rollback HTTP en fallo del historial',async()=>{
    const actor=await fixture(),auth=await cookie(actor),row=await person(actor.id);jest.spyOn(Logger.prototype,'error').mockImplementation(()=>undefined);jest.spyOn(history,'record').mockRejectedValueOnce(new Error('private fixture'));
    const result=await request(app.getHttpServer()).put('/api/v1/people/'+row.id).set('Cookie',auth).send({displayName:'No',expectedVersion:1}).expect(500);expect(JSON.stringify(result.body)).not.toContain('fixture');expect(await people.get(row.id)).toEqual(row);
  });
});
