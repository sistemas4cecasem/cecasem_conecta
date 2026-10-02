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
import { AuditAction,ContactType,ContactCondition,UserRole,Prisma } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { PasswordService } from '../src/modules/auth/password.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { DirectoryService } from '../src/modules/directory/directory.service';
import { PeopleService } from '../src/modules/directory/people.service';
import { ContactsService } from '../src/modules/directory/contacts.service';
import { DirectoryHistoryService } from '../src/modules/directory/directory-history.service';
import { AuditService } from '../src/modules/audit/audit.service';
const databaseUrl=validateDatabaseUrl(process.env.DATABASE_URL);
if(!new URL(databaseUrl).pathname.endsWith('_test'))throw new Error('Contactos requiere una base aislada _test.');
function barrier(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});return {promise,release};}
describe('Medios de contacto PostgreSQL y HTTP',()=>{
  let app:INestApplication<Server>,prisma:PrismaService,users:UsersService,people:PeopleService,directory:DirectoryService,contacts:ContactsService,history:DirectoryHistoryService,audit:AuditService,passwordHash:string;
  const password=randomBytes(24).toString('base64url');const userIds:string[]=[],personIds:string[]=[],organizationIds:string[]=[],methodIds:string[]=[];
  beforeAll(async()=>{const moduleRef=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(ConfigService).useValue(new ConfigService(validateEnvironment({NODE_ENV:'test',DATABASE_URL:databaseUrl}))).compile();
    app=moduleRef.createNestApplication<INestApplication<Server>>();configureApplication(app);await app.init();prisma=app.get(PrismaService);users=app.get(UsersService);people=app.get(PeopleService);directory=app.get(DirectoryService);contacts=app.get(ContactsService);history=app.get(DirectoryHistoryService);audit=app.get(AuditService);passwordHash=await app.get(PasswordService).hashNew(password);});
  afterEach(async()=>{jest.restoreAllMocks();await prisma.$transaction([
    prisma.auditEvent.deleteMany({where:{actorUserId:{in:userIds}}}),prisma.directoryChange.deleteMany({where:{actorUserId:{in:userIds}}}),
    prisma.personContact.deleteMany({where:{personId:{in:personIds}}}),prisma.organizationContact.deleteMany({where:{organizationId:{in:organizationIds}}}),prisma.contactMethod.deleteMany({where:{id:{in:methodIds}}}),
    prisma.person.deleteMany({where:{id:{in:personIds}}}),prisma.organization.deleteMany({where:{id:{in:organizationIds}}}),prisma.userSession.deleteMany({where:{userId:{in:userIds}}}),prisma.user.deleteMany({where:{id:{in:userIds}}}),
  ]);userIds.length=0;personIds.length=0;organizationIds.length=0;methodIds.length=0;});
  afterAll(async()=>{await app.close();});
  async function fixture(role:UserRole=UserRole.ADMINISTRATOR){const actor=await users.createIdentity({givenNames:'QA',familyNames:randomUUID(),email:randomUUID()+'@example.test',role});userIds.push(actor.id);await prisma.user.update({where:{id:actor.id},data:{passwordHash}});return actor;}
  async function person(actorId:string){const row=await people.create({displayName:'Persona QA'},actorId);personIds.push(row.id);return row;}
  async function org(actorId:string){const row=await directory.createOrganization({name:'Organización QA'},actorId);organizationIds.push(row.id);return row;}
  async function method(actorId:string,value=randomUUID()+'@example.test',type:ContactType=ContactType.EMAIL){const row=await contacts.create({type,value,label:type===ContactType.OTHER?'Canal QA':undefined},actorId);methodIds.push(row.id);return row;}
  async function cookie(actor:{email:string}){const result=await request(app.getHttpServer()).post('/api/v1/auth/login').send({email:actor.email,password}).expect(200);return (result.headers['set-cookie'] as unknown as string[])[0].split(';')[0];}
  const routes=[['get','contact-methods'],['get','contact-methods/email'],['get','contact-methods/ID'],['post','contact-methods'],['put','contact-methods/ID'],['patch','contact-methods/ID/condition'],['get','contact-methods/ID/history'],['get','contact-methods/ID/people'],['get','contact-methods/ID/organizations'],
    ...['people','organizations'].flatMap(route=>[['get',route+'/ID/contacts'],['post',route+'/ID/contacts'],['post',route+'/ID/contacts/existing']]),
    ...['person-contacts','organization-contacts'].flatMap(route=>[['get',route+'/ID'],['put',route+'/ID'],['patch',route+'/ID/end'],['patch',route+'/ID/status'],['post',route+'/ID/replace'],['get',route+'/ID/history']])
  ] as [ 'get'|'post'|'put'|'patch',string][];
  it.each(routes)('anónimo %s %s →401',async(method,path)=>{await request(app.getHttpServer())[method]('/api/v1/'+path.replace('ID',randomUUID())).expect(401);});
  it.each(routes)('sin capability %s %s →403',async(method,path)=>{const actor=await fixture();jest.spyOn(app.get(SessionsService),'findIdentity').mockResolvedValue({...actor,role:'UNKNOWN' as UserRole});await request(app.getHttpServer())[method]('/api/v1/'+path.replace('ID',randomUUID())).set('Cookie','cecasem_session=fixture').expect(403);});
  it.each(Object.values(UserRole))('%s opera ordinariamente; condición y reactivación solo Admin',async role=>{
    const actor=await fixture(role),auth=await cookie(actor),p=await person(actor.id),o=await org(actor.id);
    const created=await request(app.getHttpServer()).post('/api/v1/organizations/'+o.id+'/contacts').set('Cookie',auth).send({type:'EMAIL',value:'  CONTACTO@FUNDACION.ORG ',sourceDescription:'Sitio oficial'}).expect(201);
    const association=(created.body as {association:{id:string;contactMethodId:string}}).association;methodIds.push(association.contactMethodId);
    const exact=await request(app.getHttpServer()).get('/api/v1/contact-methods/email?email='+encodeURIComponent(' CONTACTO@FUNDACION.ORG ')).set('Cookie',auth).expect(200);
    const exactContact=(exact.body as {contact:{version:number}}).contact;
    expect(exactContact).toMatchObject({id:association.contactMethodId,type:'EMAIL',value:'contacto@fundacion.org',associationCount:1});expect(exactContact).not.toHaveProperty('normalizedValue');expect(exactContact).not.toHaveProperty('_count');
    const reused=await request(app.getHttpServer()).post('/api/v1/people/'+p.id+'/contacts/existing').set('Cookie',auth).send({contactMethodId:association.contactMethodId,expectedMethodVersion:exactContact.version,notes:'Información personal'}).expect(200);
    const reusedBody=reused.body as {outcome:string;association:{id:string}};
    expect(reusedBody.outcome).toBe('created');expect(await prisma.contactMethod.count()).toBe(1);
    await request(app.getHttpServer()).put('/api/v1/organization-contacts/'+association.id).set('Cookie',auth).send({expectedVersion:1,sourceDescription:'Fuente corregida'}).expect(200);
    expect((await contacts.getAssociation('person',reusedBody.association.id)).notes).toBe('Información personal');
    const current=await contacts.get(association.contactMethodId);
    await request(app.getHttpServer()).put('/api/v1/contact-methods/'+current.id).set('Cookie',auth).send({value:'contacto.corregido@fundacion.org',expectedVersion:current.version,confirmShared:true}).expect(200);
    await request(app.getHttpServer()).patch('/api/v1/organization-contacts/'+association.id+'/end').set('Cookie',auth).send({expectedVersion:2}).expect(200);
    for(const path of ['contact-methods','contact-methods/'+current.id,'contact-methods/'+current.id+'/people','contact-methods/'+current.id+'/organizations','contact-methods/'+current.id+'/history','organization-contacts/'+association.id,'organization-contacts/'+association.id+'/history','people/'+p.id+'/contacts','organizations/'+o.id+'/contacts'])await request(app.getHttpServer()).get('/api/v1/'+path).set('Cookie',auth).expect(200);
    await request(app.getHttpServer()).patch('/api/v1/organization-contacts/'+association.id+'/status').set('Cookie',auth).send({isActive:true,expectedVersion:3}).expect(role===UserRole.ADMINISTRATOR?200:403);
    await request(app.getHttpServer()).patch('/api/v1/contact-methods/'+current.id+'/condition').set('Cookie',auth).send({condition:'UNUSABLE',expectedVersion:current.version+1}).expect(role===UserRole.ADMINISTRATOR?200:403);
    expect((await contacts.getAssociation('person',reusedBody.association.id)).lastVerifiedAt).toBeNull();
  });
  it.each([{type:'NOPE',value:'x'},{type:'EMAIL',value:'bad'},{type:'EMAIL',value:'a@example.test',condition:'UNUSABLE'},{type:'EMAIL',value:'a@example.test',lastVerifiedAt:'2026-01-01'},{type:'PHONE',value:'abc'},{type:'LINKEDIN',value:'https://linkedin.com.evil.test'},{type:'FORM',value:'javascript:x'},{type:'OTHER',value:'Canal'}])('entrada inválida %j →400',async body=>{const auth=await cookie(await fixture());await request(app.getHttpServer()).post('/api/v1/contact-methods').set('Cookie',auth).send(body).expect(400);});
  it('creación duplicada devuelve código útil y medio existente sin asociar automáticamente',async()=>{
    const actor=await fixture(),auth=await cookie(actor),o=await org(actor.id),p=await person(actor.id);
    const first=await contacts.createAndAssociate({organizationId:o.id},{type:ContactType.EMAIL,value:'contacto@fundacion.org'},actor.id);methodIds.push(first.association.contactMethodId);
    const duplicate=await request(app.getHttpServer()).post('/api/v1/people/'+p.id+'/contacts').set('Cookie',auth).send({type:'EMAIL',value:' CONTACTO@FUNDACION.ORG ',notes:'Borrador'}).expect(409);
    expect(duplicate.body).toMatchObject({code:'CONTACT_EMAIL_EXISTS',details:{contactMethodId:first.association.contactMethodId}});expect(await prisma.personContact.count()).toBe(0);
    const current=await contacts.get(first.association.contactMethodId);await contacts.associate({personId:p.id},current.id,{expectedMethodVersion:current.version,notes:'Borrador'},actor.id);
    expect(await prisma.contactMethod.count()).toBe(1);expect(await prisma.personContact.count()).toBe(1);expect(await prisma.organizationContact.count()).toBe(1);
  });
  it('asociación repetida es 200 no-op: conserva fuente, estado, versión e historial',async()=>{
    const actor=await fixture(),auth=await cookie(actor),p=await person(actor.id),m=await method(actor.id);
    const first=await contacts.associate({personId:p.id},m.id,{expectedMethodVersion:m.version,sourceDescription:'Original'},actor.id);
    await contacts.end('person',first.association.id,{expectedVersion:1},actor.id);const before=await contacts.getAssociation('person',first.association.id),events=await prisma.directoryChange.count();
    const repeated=await request(app.getHttpServer()).post('/api/v1/people/'+p.id+'/contacts/existing').set('Cookie',auth).send({contactMethodId:m.id,expectedMethodVersion:1,sourceDescription:'No reemplazar'}).expect(200);
    expect((repeated.body as {outcome:string}).outcome).toBe('existing');expect(await contacts.getAssociation('person',first.association.id)).toEqual(before);expect(await prisma.directoryChange.count()).toBe(events);
  });
  it('historial de creación/contexto/fin tiene FK, autor, operación y auditoría tipada',async()=>{
    const actor=await fixture(),p=await person(actor.id),m=await method(actor.id);const created=await contacts.associate({personId:p.id},m.id,{expectedMethodVersion:1,sourceDescription:'Sitio oficial'},actor.id);
    await contacts.editContext('person',created.association.id,{expectedVersion:1,sourceDescription:'Documento',notes:'Corrección'},actor.id);
    const changes=await contacts.associationHistory('person',created.association.id,{page:1,pageSize:25});expect(changes.items.some(op=>op.changes.some(item=>item.field==='associationCreated'&&item.previousValue===null&&item.newValue===m.id))).toBe(true);
    const operation=changes.items.find(op=>op.changes.some(item=>item.field==='sourceDescription'&&item.previousValue==='Sitio oficial'))!;expect(operation).toMatchObject({actor:{id:actor.id}});expect(operation.changes).toContainEqual(expect.objectContaining({field:'sourceDescription',newValue:'Documento'}));
    expect(await prisma.auditEvent.findFirst({where:{operationId:operation.operationId}})).toMatchObject({action:AuditAction.CONTACT_ASSOCIATION_UPDATED,personContactId:created.association.id,actorUserId:actor.id});
  });
  it.each(['create-history','create-audit','context-history','context-audit','correction-history','correction-audit','replace-history','replace-audit'])('rollback completo %s',async kind=>{
    const actor=await fixture(),p=await person(actor.id),m=await method(actor.id),target=await method(actor.id);const association=await contacts.associate({personId:p.id},m.id,{expectedMethodVersion:1},actor.id);
    const methodBefore=await contacts.get(m.id),associationBefore=await contacts.getAssociation('person',association.association.id),count=await prisma.directoryChange.count();
    if(kind.endsWith('history'))jest.spyOn(history,'record').mockRejectedValueOnce(new Error('fixture'));else jest.spyOn(audit,'recordDirectory').mockRejectedValueOnce(new Error('fixture'));
    let operation:Promise<unknown>;
    if(kind.startsWith('create-'))operation=contacts.createAndAssociate({personId:p.id},{type:ContactType.EMAIL,value:'atomic@example.test'},actor.id);
    else if(kind.startsWith('context-'))operation=contacts.editContext('person',association.association.id,{expectedVersion:1,notes:'No confirma'},actor.id);
    else if(kind.startsWith('correction-'))operation=contacts.correct(m.id,{expectedVersion:methodBefore.version,value:'corrected@example.test',confirmShared:false},actor.id);
    else operation=contacts.replace('person',association.association.id,{contactMethodId:target.id,expectedMethodVersion:target.version,expectedVersion:1,confirmed:true},actor.id);
    await expect(operation).rejects.toThrow();expect(await prisma.contactMethod.count()).toBe(2);expect(await contacts.get(m.id)).toEqual(methodBefore);expect(await contacts.getAssociation('person',association.association.id)).toEqual(associationBefore);expect(await prisma.directoryChange.count()).toBe(count);expect(await prisma.personContact.count()).toBe(1);
  });
  it('compartido exige confirmación; sumar otro actor invalida una corrección anterior',async()=>{
    const actor=await fixture(),p=await person(actor.id),o=await org(actor.id),m=await method(actor.id);await contacts.associate({personId:p.id},m.id,{expectedMethodVersion:1},actor.id);const old=await contacts.get(m.id);
    await contacts.associate({organizationId:o.id},m.id,{expectedMethodVersion:old.version},actor.id);
    await expect(contacts.correct(m.id,{value:'new@example.test',expectedVersion:old.version,confirmShared:true},actor.id)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
    const current=await contacts.get(m.id);await expect(contacts.correct(m.id,{value:'new@example.test',expectedVersion:current.version,confirmShared:false},actor.id)).rejects.toMatchObject({code:'SHARED_CONTACT_CONFIRMATION_REQUIRED'});
    await contacts.correct(m.id,{value:'new@example.test',expectedVersion:current.version,confirmShared:true},actor.id);expect((await contacts.listActor({personId:p.id},{page:1,pageSize:25})).items[0].contactMethod.value).toBe('new@example.test');expect((await contacts.listActor({organizationId:o.id},{page:1,pageSize:25})).items[0].contactMethod.value).toBe('new@example.test');
  });
  it('corrección hacia email existente no fusiona; sustitución explícita conserva A y B',async()=>{
    const actor=await fixture(),p=await person(actor.id),o=await org(actor.id),a=await method(actor.id,'mal@example.test'),b=await method(actor.id,'bien@example.test');const ap=await contacts.associate({personId:p.id},a.id,{expectedMethodVersion:1,notes:'Antecedente'},actor.id);
    await contacts.associate({organizationId:o.id},a.id,{expectedMethodVersion:2},actor.id);
    await expect(contacts.correct(a.id,{value:b.value,expectedVersion:3,confirmShared:true},actor.id)).rejects.toMatchObject({code:'CONTACT_VALUE_EXISTS',details:{contactMethodId:b.id}});
    const result=await contacts.replace('person',ap.association.id,{contactMethodId:b.id,expectedMethodVersion:1,expectedVersion:1,confirmed:true,notes:'Revisado para nuevo canal'},actor.id);
    expect(result.previous.isActive).toBe(false);expect(result.association.contactMethodId).toBe(b.id);expect(result.association.notes).toBe('Revisado para nuevo canal');expect(await prisma.contactMethod.count()).toBe(2);expect((await contacts.listActor({organizationId:o.id},{page:1,pageSize:25})).items[0].isActive).toBe(true);expect((await contacts.get(a.id)).value).toBe('mal@example.test');
  });
  it('sustituir hacia asociación existente conserva su contexto y no duplica historial',async()=>{
    const actor=await fixture(),p=await person(actor.id),a=await method(actor.id),b=await method(actor.id);const aa=await contacts.associate({personId:p.id},a.id,{expectedMethodVersion:1},actor.id);const bb=await contacts.associate({personId:p.id},b.id,{expectedMethodVersion:1,notes:'Contexto B'},actor.id);
    const result=await contacts.replace('person',aa.association.id,{expectedVersion:1,contactMethodId:b.id,expectedMethodVersion:2,confirmed:true,notes:'No sobrescribir'},actor.id);expect(result.outcome).toBe('existing');expect(result.association.id).toBe(bb.association.id);expect(result.association.notes).toBe('Contexto B');expect(await prisma.personContact.count()).toBe(2);
  });
  it('concurrencia determinista de creación: un correo, conflicto reutilizable y asociación solo confirmada',async()=>{
    const actor=await fixture(),auth=await cookie(actor),p=await person(actor.id),o=await org(actor.id);const both=barrier(),release=barrier();let calls=0;const insert=contacts.insertMethod.bind(contacts);
    jest.spyOn(contacts,'insertMethod').mockImplementation(async(fields,tx)=>{if(++calls===2)both.release();await release.promise;return insert(fields,tx);});
    const pending=[request(app.getHttpServer()).post('/api/v1/people/'+p.id+'/contacts').set('Cookie',auth).send({type:'EMAIL',value:'race@example.test'}).then(response=>response),request(app.getHttpServer()).post('/api/v1/organizations/'+o.id+'/contacts').set('Cookie',auth).send({type:'EMAIL',value:' RACE@EXAMPLE.TEST '}).then(response=>response)];
    await both.promise;release.release();const results=await Promise.all(pending);expect(results.map(result=>result.status).sort()).toEqual([201,409]);
    const success=results.find(result=>result.status===201)!;const id=(success.body as {association:{contactMethodId:string}}).association.contactMethodId;methodIds.push(id);
    expect(results.find(result=>result.status===409)!.body).toMatchObject({code:'CONTACT_EMAIL_EXISTS',details:{contactMethodId:id}});expect(await prisma.contactMethod.count()).toBe(1);expect(await prisma.personContact.count()+await prisma.organizationContact.count()).toBe(1);
    const current=await contacts.get(id);await contacts.associate(results[0].status===409?{personId:p.id}:{organizationId:o.id},id,{expectedMethodVersion:current.version},actor.id);expect(await prisma.personContact.count()).toBe(1);expect(await prisma.organizationContact.count()).toBe(1);
  });
  it('asociación simultánea conserva un par y un único historial de creación',async()=>{
    const actor=await fixture(),p=await person(actor.id),m=await method(actor.id);const both=barrier(),release=barrier();let calls=0;const lock=contacts.lockMethod.bind(contacts);
    jest.spyOn(contacts,'lockMethod').mockImplementation(async(id,tx)=>{if(++calls===2)both.release();await release.promise;return lock(id,tx);});
    const a=contacts.associate({personId:p.id},m.id,{expectedMethodVersion:1,notes:'Primera'},actor.id),b=contacts.associate({personId:p.id},m.id,{expectedMethodVersion:1,notes:'Segunda'},actor.id);await both.promise;release.release();const results=await Promise.all([a,b]);expect(results.map(result=>result.outcome).sort()).toEqual(['created','existing']);expect(await prisma.personContact.count()).toBe(1);expect(await prisma.directoryChange.count({where:{field:'associationCreated'}})).toBe(1);
  });
  it('correcciones concurrentes del mismo medio no pierden cambios',async()=>{
    const actor=await fixture(),m=await method(actor.id);const entered=barrier(),queued=barrier(),release=barrier();let calls=0;const lock=contacts.lockMethod.bind(contacts);
    jest.spyOn(contacts,'lockMethod').mockImplementation(async(id,tx)=>{const order=++calls;if(order===2)queued.release();await lock(id,tx);if(order===1){entered.release();await release.promise;}});
    const a=contacts.correct(m.id,{value:'first@example.test',expectedVersion:1,confirmShared:false},actor.id);await entered.promise;const b=contacts.correct(m.id,{value:'second@example.test',expectedVersion:1,confirmShared:false},actor.id);await queued.promise;release.release();const results=await Promise.allSettled([a,b]);expect(results[0].status).toBe('fulfilled');expect(results[1]).toMatchObject({status:'rejected',reason:{code:'VERSION_CONFLICT'}});expect((await contacts.get(m.id)).value).toBe('first@example.test');
  });
  it('SQL protege EMAIL normalizado, pares y FK; PHONE no recibe unicidad global',async()=>{
    const actor=await fixture(),p=await person(actor.id),o=await org(actor.id),m=await method(actor.id,'nombre.apellido+proyecto@gmail.com');const pc=await contacts.associate({personId:p.id},m.id,{expectedMethodVersion:1},actor.id);const oc=await contacts.associate({organizationId:o.id},m.id,{expectedMethodVersion:2},actor.id);
    await contacts.end('person',pc.association.id,{expectedVersion:1},actor.id);
    for(const data of [{type:ContactType.EMAIL,value:m.value,normalizedValue:m.value},{type:ContactType.EMAIL,value:'UPPER@example.test',normalizedValue:'UPPER@example.test'},{type:ContactType.EMAIL,value:'x@example.test',normalizedValue:null}])await expect(prisma.contactMethod.create({data})).rejects.toThrow();
    for(const data of [{personId:p.id,contactMethodId:m.id},{personId:randomUUID(),contactMethodId:m.id},{personId:p.id,contactMethodId:randomUUID()}])await expect(prisma.personContact.create({data})).rejects.toThrow();
    await expect(prisma.organizationContact.create({data:{organizationId:o.id,contactMethodId:m.id}})).rejects.toThrow();await expect(prisma.contactMethod.delete({where:{id:m.id}})).rejects.toThrow();await expect(prisma.person.delete({where:{id:p.id}})).rejects.toThrow();await expect(prisma.organization.delete({where:{id:o.id}})).rejects.toThrow();
    await expect(prisma.personContact.update({where:{id:pc.association.id},data:{version:0}})).rejects.toThrow();await expect(prisma.organizationContact.update({where:{id:oc.association.id},data:{version:0}})).rejects.toThrow();
    const phoneA=await method(actor.id,'+591 1234567',ContactType.PHONE),phoneB=await method(actor.id,'+591 1234567',ContactType.PHONE);expect(phoneA.id).not.toBe(phoneB.id);
    const dotted=await method(actor.id,'nombreapellido@gmail.com');expect(dotted.id).not.toBe(m.id);
  });
  it('historial y auditoría SQL conservan objetivos exclusivos y valores tipados',async()=>{
    const actor=await fixture(),p=await person(actor.id),m=await method(actor.id),association=await contacts.associate({personId:p.id},m.id,{expectedMethodVersion:1},actor.id);
    const valid={personContactId:association.association.id,actorUserId:actor.id,operationId:randomUUID(),field:'notes',previousValue:Prisma.JsonNull,newValue:'Dato'};
    for(const data of [{...valid,contactMethodId:m.id},{...valid,field:'value'},{...valid,field:'isActive',newValue:'false'}])await expect(prisma.directoryChange.create({data})).rejects.toThrow();
    for(const action of Object.values(AuditAction).filter(action=>action.startsWith('CONTACT_'))) {
      const target=action.startsWith('CONTACT_METHOD')?{contactMethodId:m.id}:{personContactId:association.association.id};const data={...target,actorUserId:actor.id,operationId:randomUUID(),action};await prisma.auditEvent.create({data});await expect(prisma.auditEvent.create({data:{...data,personId:p.id}})).rejects.toThrow();await expect(prisma.auditEvent.create({data:{...data,operationId:null}})).rejects.toThrow();
    }
  });
  it('inactivación conserva contactos; no utilizable es condición global y no verificación',async()=>{
    const actor=await fixture(),p=await person(actor.id),o=await org(actor.id),m=await method(actor.id);await contacts.associate({personId:p.id},m.id,{expectedMethodVersion:1},actor.id);await people.status(p.id,{isActive:false,expectedVersion:1},actor.id);
    await contacts.condition(m.id,{condition:ContactCondition.UNUSABLE,expectedVersion:2},actor.id);await expect(contacts.associate({organizationId:o.id},m.id,{expectedMethodVersion:3},actor.id)).rejects.toMatchObject({code:'CONTACT_UNUSABLE'});
    expect((await contacts.listActor({personId:p.id},{page:1,pageSize:25})).total).toBe(1);expect((await contacts.exactEmail(m.value)).contact?.id).toBe(m.id);expect((await contacts.listActor({personId:p.id},{page:1,pageSize:25})).items[0].lastVerifiedAt).toBeNull();
  });
  it('400,404,409, no DELETE y paginación estable; actores ausentes no dejan huérfanos',async()=>{
    const actor=await fixture(),auth=await cookie(actor),p=await person(actor.id),m=await method(actor.id);const association=await contacts.associate({personId:p.id},m.id,{expectedMethodVersion:1},actor.id);
    for(const path of ['contact-methods/'+randomUUID(),'person-contacts/'+randomUUID(),'organization-contacts/'+randomUUID(),'people/'+randomUUID()+'/contacts','organizations/'+randomUUID()+'/contacts'])await request(app.getHttpServer()).get('/api/v1/'+path).set('Cookie',auth).expect(404);
    await request(app.getHttpServer()).post('/api/v1/people/'+randomUUID()+'/contacts').set('Cookie',auth).send({type:'EMAIL',value:'orphan@example.test'}).expect(404);expect(await prisma.contactMethod.count()).toBe(1);
    for(const path of ['contact-methods?pageSize=101','contact-methods/email?email=bad','people/'+p.id+'/contacts?page=0'])await request(app.getHttpServer()).get('/api/v1/'+path).set('Cookie',auth).expect(400);
    await request(app.getHttpServer()).put('/api/v1/person-contacts/'+association.association.id).set('Cookie',auth).send({expectedVersion:1,contactMethodId:randomUUID()}).expect(400);
    await contacts.editContext('person',association.association.id,{expectedVersion:1,notes:'Nuevo'},actor.id);await request(app.getHttpServer()).put('/api/v1/person-contacts/'+association.association.id).set('Cookie',auth).send({expectedVersion:1,notes:'Antiguo'}).expect(409);
    await request(app.getHttpServer()).delete('/api/v1/contact-methods/'+m.id).set('Cookie',auth).expect(404);
    const list=await request(app.getHttpServer()).get('/api/v1/contact-methods?pageSize=1').set('Cookie',auth).expect(200);expect(list.body).toMatchObject({total:1,page:1,pageSize:1,items:[{id:m.id}]});
  });
  it('servicios revalidan actor desactivado y permisos administrativos vigentes',async()=>{
    const actor=await fixture(),m=await method(actor.id);await prisma.user.update({where:{id:actor.id},data:{isActive:false,deactivatedAt:new Date()}});await expect(contacts.create({type:ContactType.EMAIL,value:'new@example.test'},actor.id)).rejects.toMatchObject({code:'FORBIDDEN'});
    await prisma.user.update({where:{id:actor.id},data:{isActive:true,deactivatedAt:null,role:UserRole.RESEARCH}});await expect(contacts.condition(m.id,{condition:ContactCondition.UNUSABLE,expectedVersion:1},actor.id)).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('fallo HTTP devuelve 500 seguro y revierte medio y asociación',async()=>{
    const actor=await fixture(),auth=await cookie(actor),p=await person(actor.id);jest.spyOn(Logger.prototype,'error').mockImplementation(()=>undefined);jest.spyOn(history,'record').mockRejectedValueOnce(new Error('private fixture'));
    const response=await request(app.getHttpServer()).post('/api/v1/people/'+p.id+'/contacts').set('Cookie',auth).send({type:'EMAIL',value:'rollback@example.test'}).expect(500);expect(JSON.stringify(response.body)).not.toContain('fixture');expect(await prisma.contactMethod.count()).toBe(0);expect(await prisma.personContact.count()).toBe(0);
  });
});
