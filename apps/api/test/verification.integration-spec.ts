import { VerificationService, VerificationClock } from '../src/modules/directory/verification.service';
import { VerificationSettingsService } from '../src/modules/settings/verification-settings.service';
import type { VerificationKind } from '../src/modules/directory/verification.rules';
import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { ContactCondition, ContactType, UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { PasswordService } from '../src/modules/auth/password.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { DirectoryService } from '../src/modules/directory/directory.service';
import { PeopleService } from '../src/modules/directory/people.service';
import { ContactsService } from '../src/modules/directory/contacts.service';
import { AuditService } from '../src/modules/audit/audit.service';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Historial requiere una base aislada _test.');
const prefixes = ['organizations', 'people', 'person-organization-relations', 'person-contacts', 'organization-contacts'];
describe('Verificación contextual, configuración PostgreSQL y HTTP', () => {
  let app: INestApplication<Server>, prisma: PrismaService, users: UsersService, directory: DirectoryService, people: PeopleService,
    contacts: ContactsService, verification: VerificationService, settings: VerificationSettingsService, passwordHash: string;
  let now = new Date('2026-01-31T12:00:00.000Z');
  let originalSettings: Awaited<ReturnType<PrismaService['verificationSettings']['findUniqueOrThrow']>>;
  const password = randomBytes(24).toString('base64url');
  const userIds: string[] = [], organizationIds: string[] = [], personIds: string[] = [], categoryIds: string[] = [], methodIds: string[] = [];
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).overrideProvider(VerificationClock).useValue({now: () => new Date(now)}).compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService); directory = app.get(DirectoryService); people = app.get(PeopleService);
    contacts = app.get(ContactsService); verification = app.get(VerificationService); settings = app.get(VerificationSettingsService); originalSettings = await prisma.verificationSettings.findUniqueOrThrow({where:{id:1}}); passwordHash = await app.get(PasswordService).hashNew(password);
  });
  afterEach(async () => {
    jest.restoreAllMocks(); now = new Date('2026-01-31T12:00:00.000Z');
    await prisma.verificationSettings.update({where:{id:1},data:originalSettings});
    await prisma.$transaction([
      prisma.verification.deleteMany({where:{actorUserId:{in:userIds}}}),
      prisma.auditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { targetUserId: { in: userIds } }] } }),
      prisma.directoryChange.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.personContact.deleteMany({ where: { personId: { in: personIds } } }),
      prisma.organizationContact.deleteMany({ where: { organizationId: { in: organizationIds } } }),
      prisma.personOrganizationRelation.deleteMany({ where: { personId: { in: personIds } } }),
      prisma.contactMethod.deleteMany({ where: { id: { in: methodIds } } }),
      prisma.person.deleteMany({ where: { id: { in: personIds } } }),
      prisma.organizationCategory.deleteMany({ where: { organizationId: { in: organizationIds } } }),
      prisma.organization.deleteMany({ where: { id: { in: organizationIds } } }),
      prisma.category.deleteMany({ where: { id: { in: categoryIds } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }), prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    userIds.length = organizationIds.length = personIds.length = categoryIds.length = methodIds.length = 0;
  });
  afterAll(async () => { await app.close(); });
  async function user(role: UserRole = UserRole.ADMINISTRATOR) {
    const row = await users.createIdentity({ givenNames: 'Autora', familyNames: 'QA Historial', email: randomUUID() + '@example.test', role });
    userIds.push(row.id); await prisma.user.update({ where: { id: row.id }, data: { passwordHash } }); return row;
  }
  async function cookie(actor: { email: string }) {
    const result = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: actor.email, password }).expect(200);
    return (result.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }
  async function organization(actor: string, name = 'Institución histórica') {
    const row = await directory.createOrganization({ name }, actor); organizationIds.push(row.id); return row;
  }
  async function person(actor: string) { const row = await people.create({ displayName: 'María histórica' }, actor); personIds.push(row.id); return row; }
  async function category(actor: string) { const row = await directory.createCategory({ name: 'Derechos Humanos' }, actor); categoryIds.push(row.id); return row; }
  async function medium(actor: string) { const row = await contacts.create({ type: ContactType.EMAIL, value: randomUUID() + '@example.test' }, actor); methodIds.push(row.id); return row; }
  async function targets(actor: string) {
    const org = await organization(actor), p = await person(actor), cat = await category(actor), m = await medium(actor);
    const relation = await people.createRelation(p.id, { organizationId: org.id, isCurrent: true, positionTitle: 'Coordinadora' }, actor);
    const pc = await contacts.associate({ personId: p.id }, m.id, { expectedMethodVersion: 1, sourceDescription: 'Fuente personal' }, actor);
    const oc = await contacts.associate({ organizationId: org.id }, m.id, { expectedMethodVersion: 2, sourceDescription: 'Fuente institucional' }, actor);
    return { org, p, cat, m, relation, pc: pc.association, oc: oc.association,
      paths: [org.id, p.id, relation.id, pc.association.id, oc.association.id].map((id, index) => prefixes[index] + '/' + id + '/history') };
  }
  const kinds: VerificationKind[] = ['organization', 'person', 'relation', 'personContact', 'organizationContact'];
  const page = { page: 1, pageSize: 25 };
  function objects(rows: Awaited<ReturnType<typeof targets>>) { return [rows.org.id, rows.p.id, rows.relation.id, rows.pc.id, rows.oc.id]; }
  const input = (kind: VerificationKind, version = 1, contactVersion = 1) => ({ expectedVersion: version, ...(['personContact','organizationContact'].includes(kind) ? { expectedContactValueVersion: contactVersion } : {}) });
  it.each(prefixes)('anónimo no lee ni verifica %s', async prefix => {
    for (const suffix of ['verification','verifications']) await request(app.getHttpServer()).get('/api/v1/'+prefix+'/'+randomUUID()+'/'+suffix).expect(401);
    await request(app.getHttpServer()).post('/api/v1/'+prefix+'/'+randomUUID()+'/verify').send({expectedVersion:1}).expect(401);
  });
  it.each(prefixes)('sin capability recibe 403 en %s', async prefix => {
    const actor = await user(); jest.spyOn(app.get(SessionsService), 'findIdentity').mockResolvedValue({...actor,role:'UNKNOWN' as UserRole});
    await request(app.getHttpServer()).post('/api/v1/'+prefix+'/'+randomUUID()+'/verify').set('Cookie','cecasem_session=fixture').send({expectedVersion:1}).expect(403);
  });
  it.each(Object.values(UserRole))('%s corrobora los cinco objetos y lee configuración', async role => {
    const actor = await user(role), auth = await cookie(actor), rows = await targets(actor.id), ids = objects(rows);
    for (let index=0;index<kinds.length;index++) {
      const result=await request(app.getHttpServer()).post('/api/v1/'+prefixes[index]+'/'+ids[index]+'/verify').set('Cookie',auth).send({...input(kinds[index]),sourceDescription:'Documento institucional',sourceUrl:'https://example.test/fuente'}).expect(201);
      const body = result.body as {event: {actor:{id:string};verifiedAt:string};condition:{verificationStatus:string;intervalMonths:number}};
      expect(body.event.actor.id).toBe(actor.id); expect(body.event.verifiedAt).toBe(now.toISOString()); expect(body.condition.verificationStatus).toBe('CURRENT');
      expect(body.condition.intervalMonths).toBe(index===0||index===4?12:6);
      const history=await request(app.getHttpServer()).get('/api/v1/'+prefixes[index]+'/'+ids[index]+'/verifications').set('Cookie',auth).expect(200);
      expect((history.body as {total:number}).total).toBe(1); expect(JSON.stringify(history.body)).not.toMatch(/passwordHash|tokenHash|actorUserId|objectVersion/);
    }
    await request(app.getHttpServer()).get('/api/v1/settings/verification').set('Cookie',auth).expect(200);
    await request(app.getHttpServer()).put('/api/v1/settings/verification').set('Cookie',auth).send({personalVerificationMonths:4,institutionalVerificationMonths:12,expectedVersion:1}).expect(role===UserRole.ADMINISTRATOR?200:403);
  });
  it.each(prefixes)('UUID, ausente, DTO y página se validan en %s', async prefix => {
    const auth=await cookie(await user());
    await request(app.getHttpServer()).get('/api/v1/'+prefix+'/invalid/verification').set('Cookie',auth).expect(400);
    await request(app.getHttpServer()).post('/api/v1/'+prefix+'/'+randomUUID()+'/verify').set('Cookie',auth).send({expectedVersion:1}).expect(404);
    await request(app.getHttpServer()).post('/api/v1/'+prefix+'/'+randomUUID()+'/verify').set('Cookie',auth).send({expectedVersion:0,verifiedAt:'2020-01-01'}).expect(400);
    await request(app.getHttpServer()).get('/api/v1/'+prefix+'/'+randomUUID()+'/verifications?pageSize=101').set('Cookie',auth).expect(400);
  });
  it('RF-14/RF-19: crear/editar no verifica; corroborar no modifica ficha, historial ni auditoría', async () => {
    const actor=await user(), p=await person(actor.id); const initial=await people.get(p.id);
    expect(await verification.status('person',p.id)).toMatchObject({verificationStatus:'NEVER_VERIFIED',lastVerifiedAt:null});
    await people.edit(p.id,{displayName:'Nombre corregido',expectedVersion:1},actor.id); const before=await people.get(p.id);
    const changes=await prisma.directoryChange.count(),audits=await prisma.auditEvent.count();
    const result=await verification.verify('person',p.id,{expectedVersion:2,sourceDescription:' Consulta '},actor.id);
    expect(result.condition).toMatchObject({verificationStatus:'CURRENT',lastVerifiedAt:now});
    expect(await people.get(p.id)).toMatchObject({createdAt:initial.createdAt,updatedAt:before.updatedAt,version:2,lastVerifiedAt:now});
    expect(await prisma.directoryChange.count()).toBe(changes);expect(await prisma.auditEvent.count()).toBe(audits);
  });
  it.each(kinds)('%s preserva corroboración histórica tras modificar y una nueva corroboración restablece vigencia', async kind => {
    const actor=await user(), rows=await targets(actor.id), id=objects(rows)[kinds.indexOf(kind)];
    await verification.verify(kind,id,input(kind),actor.id); const first=await verification.history(kind,id,page);
    if(kind==='organization')await directory.editOrganization(id,{name:'Nueva ficha',expectedVersion:1},actor.id);
    else if(kind==='person')await people.edit(id,{displayName:'Nueva ficha',expectedVersion:1},actor.id);
    else if(kind==='relation')await people.editRelation(id,{positionTitle:'Directora',isCurrent:true,expectedVersion:1},actor.id);
    else await contacts.editContext(kind==='personContact'?'person':'organization',id,{sourceDescription:'Nueva fuente',expectedVersion:1},actor.id);
    expect(await verification.status(kind,id)).toMatchObject({verificationStatus:'REVIEW_DUE',changedSinceVerification:true,lastVerifiedAt:now,timeReviewDue:false});
    expect(await verification.history(kind,id,page)).toEqual(first); now=new Date(+now+1);
    await verification.verify(kind,id,input(kind,2),actor.id);expect((await verification.history(kind,id,page)).total).toBe(2);
    expect(await verification.status(kind,id)).toMatchObject({verificationStatus:'CURRENT',changedSinceVerification:false});
  });
  it('contacto compartido: verificar una asociación no corrobora las demás; corrección de valor exige revisar ambas', async () => {
    const actor=await user(), rows=await targets(actor.id);
    await verification.verify('personContact',rows.pc.id,input('personContact'),actor.id);
    expect((await verification.status('organizationContact',rows.oc.id)).verificationStatus).toBe('NEVER_VERIFIED');
    await verification.verify('organizationContact',rows.oc.id,input('organizationContact'),actor.id);
    const before=await prisma.verification.findMany({orderBy:{id:'asc'}});
    const extra=await person(actor.id);await contacts.associate({personId:extra.id},rows.m.id,{expectedMethodVersion:3},actor.id);
    expect((await verification.status('personContact',rows.pc.id)).verificationStatus).toBe('CURRENT');
    await contacts.correct(rows.m.id,{value:randomUUID()+'@example.test',confirmShared:true,expectedVersion:4},actor.id);
    for(const [kind,id] of [['personContact',rows.pc.id],['organizationContact',rows.oc.id]] as const)expect(await verification.status(kind,id)).toMatchObject({verificationStatus:'REVIEW_DUE',changedSinceVerification:true,contactValueVersion:2});
    expect(await prisma.verification.findMany({orderBy:{id:'asc'}})).toEqual(before);
    await expect(verification.verify('personContact',rows.pc.id,input('personContact'),actor.id)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  });
  it('corregir el canal y regresar al mismo valor no vuelve vigente una corroboración anterior', async () => {
    const actor=await user(),rows=await targets(actor.id);await verification.verify('personContact',rows.pc.id,input('personContact'),actor.id);
    await contacts.correct(rows.m.id,{value:randomUUID()+'@example.test',confirmShared:true,expectedVersion:3},actor.id);
    await contacts.correct(rows.m.id,{value:rows.m.value,confirmShared:true,expectedVersion:4},actor.id);
    expect(await verification.status('personContact',rows.pc.id)).toMatchObject({verificationStatus:'REVIEW_DUE',contactValueVersion:3});
  });
  it('cambiar solo etiqueta o condición del medio no declara cambios de su valor', async () => {
    const actor=await user(),rows=await targets(actor.id);await verification.verify('personContact',rows.pc.id,input('personContact'),actor.id);
    await contacts.correct(rows.m.id,{value:rows.m.value,label:'Institucional',confirmShared:true,expectedVersion:3},actor.id);
    await contacts.condition(rows.m.id,{condition:ContactCondition.UNUSABLE,expectedVersion:4},actor.id);
    expect(await verification.status('personContact',rows.pc.id)).toMatchObject({verificationStatus:'CURRENT',contactValueVersion:1,changedSinceVerification:false});
  });
  it('RF-20/RF-21: reducción y restauración recalculan sin reescribir verificaciones', async () => {
    const actor=await user(),p=await person(actor.id);await verification.verify('person',p.id,{expectedVersion:1},actor.id);const before=await prisma.verification.findMany();
    now=new Date('2026-06-30T12:00:00Z');expect((await verification.status('person',p.id)).verificationStatus).toBe('CURRENT');
    await settings.update({personalVerificationMonths:4,institutionalVerificationMonths:12,expectedVersion:1},actor.id);
    expect(await verification.status('person',p.id)).toMatchObject({verificationStatus:'REVIEW_DUE',timeReviewDue:true,changedSinceVerification:false});
    await settings.update({personalVerificationMonths:6,institutionalVerificationMonths:12,expectedVersion:2},actor.id);
    expect((await verification.status('person',p.id)).verificationStatus).toBe('CURRENT');expect(await prisma.verification.findMany()).toEqual(before);
  });
  it('frontera temporal exacta se calcula en servidor sin cambiar verifiedAt', async () => {
    const actor=await user(),p=await person(actor.id);await verification.verify('person',p.id,{expectedVersion:1},actor.id);
    for(const [offset,expected] of [[-1,'CURRENT'],[0,'REVIEW_DUE'],[1,'REVIEW_DUE']] as const){now=new Date(+new Date('2026-07-31T12:00:00Z')+offset);expect((await verification.status('person',p.id)).verificationStatus).toBe(expected);}
  });
  it('autor desactivado sigue visible con FK y sin acceso privado a User', async () => {
    const author=await user(UserRole.RESEARCH),admin=await user(),p=await person(author.id),auth=await cookie(admin);
    await verification.verify('person',p.id,{expectedVersion:1},author.id);
    await request(app.getHttpServer()).post('/api/v1/users/'+author.id+'/deactivate').set('Cookie',auth).expect(204);
    expect((await verification.status('person',p.id)).lastVerifiedBy).toMatchObject({id:author.id,isActive:false});
    expect((await verification.history('person',p.id,page)).items[0].actor.isActive).toBe(false);
    await expect(prisma.user.delete({where:{id:author.id}})).rejects.toThrow();
  });
  it.each(kinds)('%s inactivo/histórico puede corroborarse sin reactivarse; canal UNUSABLE permanece así', async kind => {
    const actor=await user(),rows=await targets(actor.id),id=objects(rows)[kinds.indexOf(kind)];
    if(kind==='organization')await directory.organizationStatus(id,{isActive:false,expectedVersion:1},actor.id);
    else if(kind==='person')await people.status(id,{isActive:false,expectedVersion:1},actor.id);
    else if(kind==='relation')await people.endRelation(id,{expectedVersion:1},actor.id);
    else {await contacts.end(kind==='personContact'?'person':'organization',id,{expectedVersion:1},actor.id);await contacts.condition(rows.m.id,{condition:ContactCondition.UNUSABLE,expectedVersion:3},actor.id);}
    const auth=await cookie(actor);await request(app.getHttpServer()).post('/api/v1/'+prefixes[kinds.indexOf(kind)]+'/'+id+'/verify').set('Cookie',auth).send(input(kind,2)).expect(201);
    const row=kind==='organization'?await directory.getOrganization(id):kind==='person'?await people.get(id):kind==='relation'?await people.getRelation(id):await contacts.getAssociation(kind==='personContact'?'person':'organization',id);
    expect('isCurrent' in row?row.isCurrent:row.isActive).toBe(false);if(kind.endsWith('Contact'))expect((await contacts.get(rows.m.id)).condition).toBe(ContactCondition.UNUSABLE);
  });
  it.each(['organizationId','personId','personRelationId','personContactId','organizationContactId'] as const)('FK de objetivo %s rechaza referencias ausentes', async column => {
    const actor=await user();await expect(prisma.verification.create({data:{[column]:randomUUID(),actorUserId:actor.id,objectVersion:1,...(column.endsWith('ContactId')?{contactValueVersion:1}:{})}})).rejects.toThrow();
  });
  it('constraints rechazan objetivo vacío/múltiple, autor ausente y snapshots de versiones incoherentes', async () => {
    const actor=await user(),rows=await targets(actor.id),base={actorUserId:actor.id,objectVersion:1};
    for(const data of [base,{...base,personId:rows.p.id,organizationId:rows.org.id},{...base,personId:rows.p.id,contactValueVersion:1},{...base,personContactId:rows.pc.id},{...base,personId:rows.p.id,objectVersion:0},{...base,personId:rows.p.id,actorUserId:randomUUID()}])await expect(prisma.verification.create({data})).rejects.toThrow();
  });
  it('verificaciones concurrentes conservan ambos eventos y versiones; materialización no cambia updatedAt', async () => {
    const a=await user(),b=await user(),p=await person(a.id),before=await people.get(p.id);
    await Promise.all([verification.verify('person',p.id,{expectedVersion:1},a.id),verification.verify('person',p.id,{expectedVersion:1},b.id)]);
    const result=await verification.history('person',p.id,{page:1,pageSize:1});expect(result.total).toBe(2);expect(result.items).toHaveLength(1);
    expect((await verification.history('person',p.id,{page:2,pageSize:1})).items[0].id).not.toBe(result.items[0].id);
    expect(await people.get(p.id)).toMatchObject({version:1,updatedAt:before.updatedAt,lastVerifiedAt:now});
    expect(new Set((await verification.history('person',p.id,page)).items.map(event=>event.actor.id))).toEqual(new Set([a.id,b.id]));
  });
  it('fallo de materialización revierte el evento de verificación', async () => {
    const actor=await user(),p=await person(actor.id);jest.spyOn(prisma,'$transaction').mockImplementationOnce(async work=>{
      if(typeof work!=='function')throw new Error('fixture');return prisma.$transaction(async tx=>{jest.spyOn(tx,'$executeRaw').mockRejectedValueOnce(new Error('fixture'));return work(tx);});
    });
    await expect(verification.verify('person',p.id,{expectedVersion:1},actor.id)).rejects.toThrow();expect(await prisma.verification.count()).toBe(0);expect((await people.get(p.id)).lastVerifiedAt).toBeNull();
  });
  it('settings default/no-op/concurrencia/rollback conservan invariantes y auditoría tipada', async () => {
    const actor=await user();expect(await settings.get()).toEqual({personalVerificationMonths:6,institutionalVerificationMonths:12,version:1});
    await settings.update({personalVerificationMonths:6,institutionalVerificationMonths:12,expectedVersion:1},actor.id);expect(await prisma.auditEvent.count()).toBe(0);
    const outcomes=await Promise.allSettled([settings.update({personalVerificationMonths:4,institutionalVerificationMonths:12,expectedVersion:1},actor.id),settings.update({personalVerificationMonths:5,institutionalVerificationMonths:12,expectedVersion:1},actor.id)]);
    expect(outcomes.filter(item=>item.status==='fulfilled')).toHaveLength(1);expect(outcomes.filter(item=>item.status==='rejected')).toHaveLength(1);
    const audit=await prisma.auditEvent.findFirstOrThrow({where:{actorUserId:actor.id}});expect(audit).toMatchObject({action:'VERIFICATION_SETTINGS_CHANGED',previousPersonalVerificationMonths:6,newInstitutionalVerificationMonths:12});
    const before=await settings.get();jest.spyOn(app.get(AuditService),'recordVerificationSettings').mockRejectedValueOnce(new Error('fixture'));
    await expect(settings.update({personalVerificationMonths:9,institutionalVerificationMonths:12,expectedVersion:before.version},actor.id)).rejects.toThrow();expect(await settings.get()).toEqual(before);expect(await prisma.auditEvent.count()).toBe(1);
  });
  it.each([0,-1,121,1.5,999999,'6',null])('HTTP rechaza intervalo %j', async value => {
    const auth=await cookie(await user());await request(app.getHttpServer()).put('/api/v1/settings/verification').set('Cookie',auth).send({personalVerificationMonths:value,institutionalVerificationMonths:12,expectedVersion:1}).expect(400);
  });
  it('settings/audit CHECK rechazan datos inválidos y no permiten reescritura pública de eventos', async () => {
    const actor=await user(),p=await person(actor.id),auth=await cookie(actor);
    await expect(prisma.verificationSettings.create({data:{id:2}})).rejects.toThrow();await expect(prisma.verificationSettings.update({where:{id:1},data:{personalVerificationMonths:0}})).rejects.toThrow();
    await settings.update({personalVerificationMonths:4,institutionalVerificationMonths:12,expectedVersion:1},actor.id);const event=await prisma.auditEvent.findFirstOrThrow({where:{actorUserId:actor.id}});
    await expect(prisma.auditEvent.create({data:{action:event.action,actorUserId:actor.id,operationId:randomUUID(),previousPersonalVerificationMonths:6,newPersonalVerificationMonths:4,previousInstitutionalVerificationMonths:12,newInstitutionalVerificationMonths:12,personId:p.id}})).rejects.toThrow();
    for(const method of ['put','delete'] as const)await request(app.getHttpServer())[method]('/api/v1/people/'+p.id+'/verifications').set('Cookie',auth).send({}).expect(404);
    await request(app.getHttpServer()).post('/api/v1/categories/'+randomUUID()+'/verify').set('Cookie',auth).send({expectedVersion:1}).expect(404);
    await request(app.getHttpServer()).post('/api/v1/contact-methods/'+randomUUID()+'/verify').set('Cookie',auth).send({expectedVersion:1}).expect(404);
  });
});
