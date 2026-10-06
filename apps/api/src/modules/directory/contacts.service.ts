import { organizationContactOrigins, personContactOrigins, provenanceContract } from './consolidation-provenance';
import { DirectoryActorPolicy } from './directory-actor.policy';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditAction, ContactCondition, ContactType, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { PERMISSIONS, type Permission } from '../auth/authorization/permission';
import { hasPermission } from '../auth/authorization/role-permissions';
import { AuditService } from '../audit/audit.service';
import { DirectoryHistoryService, type DirectoryTarget, type FieldChange, type HistoryRecordOptions } from './directory-history.service';
import { DirectoryService } from './directory.service';
import { DirectoryError } from './directory.errors';
import { assertVersion } from './directory.rules';
import { contactContext, contactFields } from './contacts.rules';
import type { ContactConditionDto, ContactContextDto, ContactContextEditDto, ContactCorrectionDto, ContactCreateAssociationDto, ContactEndDto, ContactInputDto, ContactReplacementDto, ContactsQueryDto } from './contacts.dto';
import type { DirectoryStatusDto, PageQueryDto } from './directory.dto';

export type ContactActor = { personId:string } | { organizationId:string };
export type AssociationKind = 'person' | 'organization';
const methodSelect = { id:true,type:true,value:true,label:true,condition:true,version:true,createdAt:true,updatedAt:true,
  _count:{select:{people:true,organizations:true}} } satisfies Prisma.ContactMethodSelect;
const associationFields = {id:true,contactMethodId:true,sourceDescription:true,sourceUrl:true,notes:true,isActive:true,version:true,createdAt:true,updatedAt:true,lastVerifiedAt:true,
  contactMethod:{select:methodSelect}};
const personSelect = {...associationFields,reconciliationTargets:personContactOrigins,personId:true,person:{select:{id:true,displayName:true,isActive:true,duplicateOfId:true}}} satisfies Prisma.PersonContactSelect;
const organizationSelect = {...associationFields,reconciliationTargets:organizationContactOrigins,organizationId:true,organization:{select:{id:true,name:true,isActive:true,duplicateOfId:true}}} satisfies Prisma.OrganizationContactSelect;
type MethodRow = Prisma.ContactMethodGetPayload<{select:typeof methodSelect}>;
type PersonRow = Prisma.PersonContactGetPayload<{select:typeof personSelect}>;
type OrganizationRow = Prisma.OrganizationContactGetPayload<{select:typeof organizationSelect}>;
type AssociationRow = PersonRow | OrganizationRow;
function methodContract(row:MethodRow) {const {_count,...fields}=row;return {...fields,associationCount:_count.people+_count.organizations};}
function associationContract(row:AssociationRow) {const {reconciliationTargets,...fields}=row;return {...fields,contactMethod:methodContract(row.contactMethod),consolidationOrigins:provenanceContract(reconciliationTargets??[])};}
function paging(query:PageQueryDto) {return {skip:(query.page-1)*query.pageSize,take:query.pageSize};}
function targetOf(kind:AssociationKind,id:string):DirectoryTarget {return kind==='person'?{personContactId:id}:{organizationContactId:id};}
function actorOf(row:AssociationRow):ContactActor {return 'personId' in row?{personId:row.personId}:{organizationId:row.organizationId};}
function kindOf(actor:ContactActor):AssociationKind {return 'personId' in actor?'person':'organization';}

@Injectable()
export class ContactsService {
  constructor(private readonly actors: DirectoryActorPolicy, private readonly prisma:PrismaService,private readonly users:UsersService,private readonly history:DirectoryHistoryService,
    private readonly audit:AuditService,private readonly directory:DirectoryService) {}
  private async authorize(actorId:string,permission:Permission,tx:Prisma.TransactionClient) {
    const actor=await this.users.findIdentityById(actorId,tx);
    if(!actor?.isActive || !hasPermission(actor.role,permission)) throw new DirectoryError('FORBIDDEN');
    await this.actors.lock(tx);
  }
  private async method(id:string,tx:Prisma.TransactionClient=this.prisma) {
    const row=await tx.contactMethod.findUnique({where:{id},select:methodSelect});
    if(!row) throw new DirectoryError('CONTACT_METHOD_NOT_FOUND');return row;
  }
  private async actorExists(actor:ContactActor,tx:Prisma.TransactionClient=this.prisma) {
    if('personId' in actor) {if(!await tx.person.findUnique({where:{id:actor.personId},select:{id:true}}))throw new DirectoryError('PERSON_NOT_FOUND');}
    else if(!await tx.organization.findUnique({where:{id:actor.organizationId},select:{id:true}}))throw new DirectoryError('ORGANIZATION_NOT_FOUND');
  }
  async lockMethod(id:string,tx:Prisma.TransactionClient) {await tx.$queryRaw`SELECT id FROM "ContactMethod" WHERE id=${id}::uuid FOR UPDATE`;}
  async list(query:ContactsQueryDto) {
    const where=query.type?{type:query.type}:{};
    const [rows,total]=await this.prisma.$transaction([this.prisma.contactMethod.findMany({where,select:methodSelect,orderBy:[{createdAt:'desc'},{id:'desc'}],...paging(query)}),this.prisma.contactMethod.count({where})],{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
    return {items:rows.map(methodContract),total,page:query.page,pageSize:query.pageSize};
  }
  async get(id:string) {return methodContract(await this.method(id));}
  async exactEmail(email:string) {
    const normalized=contactFields({type:ContactType.EMAIL,value:email}).normalizedValue!;
    const row=await this.prisma.contactMethod.findFirst({where:{type:ContactType.EMAIL,normalizedValue:normalized},select:methodSelect});
    return {contact:row?methodContract(row):null};
  }
  // ON CONFLICT respeta el índice parcial incluso si dos consultas previas no encontraron correo.
  async insertMethod(fields:ReturnType<typeof contactFields>,tx:Prisma.TransactionClient) {
    if(fields.type!==ContactType.EMAIL) return tx.contactMethod.create({data:fields,select:methodSelect});
    const candidateId=randomUUID();
    const rows=await tx.$queryRaw<{id:string}[]>`INSERT INTO "ContactMethod" (id,type,value,"normalizedValue",label)
      VALUES (${candidateId}::uuid,'EMAIL',${fields.value},${fields.normalizedValue},${fields.label})
      ON CONFLICT ("normalizedValue") WHERE type='EMAIL' DO UPDATE SET id="ContactMethod".id RETURNING id`;
    // La fila existente queda bloqueada hasta responder; el no-op se revierte al lanzar el conflicto.
    if(rows[0].id!==candidateId)throw new DirectoryError('CONTACT_EMAIL_EXISTS',{contactMethodId:rows[0].id});
    return this.method(rows[0].id,tx);
  }
  async create(input:ContactInputDto,actorId:string) {
    const fields=contactFields(input);
    return this.prisma.$transaction(async tx=>{await this.authorize(actorId,PERMISSIONS.DIRECTORY_WRITE,tx);return methodContract(await this.insertMethod(fields,tx));});
  }
  async createAndAssociate(actor:ContactActor,input:ContactCreateAssociationDto,actorId:string) {
    const fields=contactFields(input),context=contactContext(input);
    return this.prisma.$transaction(async tx=>{
      await this.authorize(actorId,PERMISSIONS.DIRECTORY_WRITE,tx);await this.actorExists(actor,tx);await this.actors.writable(kindOf(actor),'personId' in actor?actor.personId:actor.organizationId,tx);
      const method=await this.insertMethod(fields,tx);
      return this.associateInTransaction(actor,method.id,context,actorId,tx);
    });
  }
  async associate(actor:ContactActor,methodId:string,input:ContactContextDto & {expectedMethodVersion:number},actorId:string) {
    const context=contactContext(input);
    return this.prisma.$transaction(async tx=>{
      await this.authorize(actorId,PERMISSIONS.DIRECTORY_WRITE,tx);await this.actorExists(actor,tx);await this.actors.writable(kindOf(actor),'personId' in actor?actor.personId:actor.organizationId,tx);
      return this.associateInTransaction(actor,methodId,context,actorId,tx,input.expectedMethodVersion);
    });
  }
  private async associateInTransaction(actor:ContactActor,methodId:string,context:ReturnType<typeof contactContext>,actorId:string,tx:Prisma.TransactionClient,expectedMethodVersion?:number,historyOptions?:HistoryRecordOptions) {
    await this.actors.writable(kindOf(actor),'personId' in actor?actor.personId:actor.organizationId,tx);
    await this.lockMethod(methodId,tx);const method=await this.method(methodId,tx);
    const existing='personId' in actor?await tx.personContact.findUnique({where:{personId_contactMethodId:{personId:actor.personId,contactMethodId:methodId}},select:personSelect}):
      await tx.organizationContact.findUnique({where:{organizationId_contactMethodId:{organizationId:actor.organizationId,contactMethodId:methodId}},select:organizationSelect});
    // Una asociación repetida conserva su contexto y su estado; reactivar requiere acción explícita.
    if(existing)return {outcome:'existing' as const,association:associationContract(existing)};
    if(expectedMethodVersion!==undefined)assertVersion(method.version,expectedMethodVersion);
    if(method.condition===ContactCondition.UNUSABLE)throw new DirectoryError('CONTACT_UNUSABLE');
    const row='personId' in actor?await tx.personContact.create({data:{...actor,contactMethodId:methodId,...context},select:personSelect}):
      await tx.organizationContact.create({data:{...actor,contactMethodId:methodId,...context},select:organizationSelect});
    const changes:FieldChange[]=[{field:'associationCreated',previousValue:null,newValue:methodId}];
    for(const field of ['sourceDescription','sourceUrl','notes'] as const)if(context[field]!==null)changes.push({field,previousValue:null,newValue:context[field]});
    await this.record(targetOf(kindOf(actor),row.id),actorId,changes,AuditAction.CONTACT_ASSOCIATION_CREATED,tx,historyOptions);
    // Cambia la versión que protege una corrección global si aparecen nuevos actores afectados.
    await tx.contactMethod.update({where:{id:methodId},data:{version:{increment:1}}});
    return {outcome:'created' as const,association:associationContract(await this.association(kindOf(actor),row.id,tx))};
  }
  private async record(target:DirectoryTarget,actorId:string,changes:FieldChange[],action:Parameters<AuditService['recordDirectory']>[0],tx:Prisma.TransactionClient,historyOptions?:HistoryRecordOptions) {
    const operationId=await this.history.record(target,actorId,changes,tx,historyOptions);await this.audit.recordDirectory(action,target,actorId,operationId,tx);
  }
  async correct(id:string,input:ContactCorrectionDto,actorId:string) {
    let normalized:string|null=null;
    try {return await this.prisma.$transaction(async tx=>{
      await this.authorize(actorId,PERMISSIONS.DIRECTORY_WRITE,tx);await this.lockMethod(id,tx);
      const current=await this.method(id,tx);assertVersion(current.version,input.expectedVersion);
      const fields=contactFields({type:current.type,value:input.value,label:input.label});normalized=fields.normalizedValue;
      const changes:FieldChange[]=[];
      for(const field of ['value','label'] as const)if(current[field]!==fields[field])changes.push({field,previousValue:current[field],newValue:fields[field]});
      if(!changes.length)return methodContract(current);
      if(current._count.people+current._count.organizations>1 && !input.confirmShared)throw new DirectoryError('SHARED_CONTACT_CONFIRMATION_REQUIRED');
      if(fields.type===ContactType.EMAIL) {
        const existing=await tx.contactMethod.findFirst({where:{type:ContactType.EMAIL,normalizedValue:fields.normalizedValue,id:{not:id}},select:{id:true}});
        if(existing)throw new DirectoryError('CONTACT_VALUE_EXISTS',{contactMethodId:existing.id});
      }
      await tx.contactMethod.update({where:{id},data:{...fields,version:{increment:1},...(current.value!==fields.value?{valueVersion:{increment:1}}:{})}});
      await this.record({contactMethodId:id},actorId,changes,AuditAction.CONTACT_METHOD_UPDATED,tx);
      return methodContract(await this.method(id,tx));
    });}catch(error) {
      if(normalized && error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2002') {
        const existing=await this.prisma.contactMethod.findFirst({where:{type:ContactType.EMAIL,normalizedValue:normalized},select:{id:true}});
        if(existing)throw new DirectoryError('CONTACT_VALUE_EXISTS',{contactMethodId:existing.id});
      }
      throw error;
    }
  }
  async condition(id:string,input:ContactConditionDto,actorId:string) {
    return this.prisma.$transaction(async tx=>{
      await this.authorize(actorId,PERMISSIONS.DIRECTORY_WRITE,tx);await this.lockMethod(id,tx);
      const current=await this.method(id,tx);assertVersion(current.version,input.expectedVersion);
      if(current.condition===input.condition)return methodContract(current);
      await tx.contactMethod.update({where:{id},data:{condition:input.condition,version:{increment:1}}});
      await this.record({contactMethodId:id},actorId,[{field:'condition',previousValue:current.condition,newValue:input.condition}],AuditAction.CONTACT_METHOD_CONDITION_CHANGED,tx);
      return methodContract(await this.method(id,tx));
    });
  }
  private async association(kind:AssociationKind,id:string,tx:Prisma.TransactionClient=this.prisma):Promise<AssociationRow> {
    const row=kind==='person'?await tx.personContact.findUnique({where:{id},select:personSelect}):await tx.organizationContact.findUnique({where:{id},select:organizationSelect});
    if(!row)throw new DirectoryError('CONTACT_ASSOCIATION_NOT_FOUND');return row;
  }
  async getAssociation(kind:AssociationKind,id:string) {return associationContract(await this.association(kind,id));}
  async listActor(actor:ContactActor,query:PageQueryDto) {await this.actorExists(actor);return this.listAssociations(kindOf(actor),actor,query);}
  async listMethod(id:string,kind:AssociationKind,query:PageQueryDto) {await this.method(id);return this.listAssociations(kind,{contactMethodId:id},query);}
  private async listAssociations(kind:AssociationKind,where:{personId?:string;organizationId?:string;contactMethodId?:string},query:PageQueryDto) {
    const orderBy=[{createdAt:'desc' as const},{id:'desc' as const}];
    if(kind==='person') {
      const [rows,total]=await this.prisma.$transaction([this.prisma.personContact.findMany({where,select:personSelect,orderBy,...paging(query)}),this.prisma.personContact.count({where})],{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
      return {items:rows.map(associationContract),total,page:query.page,pageSize:query.pageSize};
    }
    const [rows,total]=await this.prisma.$transaction([this.prisma.organizationContact.findMany({where,select:organizationSelect,orderBy,...paging(query)}),this.prisma.organizationContact.count({where})],{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
    return {items:rows.map(associationContract),total,page:query.page,pageSize:query.pageSize};
  }
  private async lockedAssociation(kind:AssociationKind,id:string,tx:Prisma.TransactionClient) {
    const initial=await this.association(kind,id,tx);
    const owner=actorOf(initial);await this.actors.writable(kind,'personId' in owner?owner.personId:owner.organizationId,tx);
    await this.lockMethod(initial.contactMethodId,tx);
    // Todas las escrituras usan el mismo orden: medio → asociación.
    if(kind==='person')await tx.$queryRaw`SELECT id FROM "PersonContact" WHERE id=${id}::uuid FOR UPDATE`;
    else await tx.$queryRaw`SELECT id FROM "OrganizationContact" WHERE id=${id}::uuid FOR UPDATE`;
    return this.association(kind,id,tx);
  }
  private async updateAssociation(kind:AssociationKind,id:string,data:Prisma.PersonContactUpdateInput & Prisma.OrganizationContactUpdateInput,tx:Prisma.TransactionClient) {
    if(kind==='person')await tx.personContact.update({where:{id},data});else await tx.organizationContact.update({where:{id},data});
  }
  async editContext(kind:AssociationKind,id:string,input:ContactContextEditDto,actorId:string) {
    const fields=contactContext(input);
    return this.prisma.$transaction(async tx=>{
      await this.authorize(actorId,PERMISSIONS.DIRECTORY_WRITE,tx);const current=await this.lockedAssociation(kind,id,tx);assertVersion(current.version,input.expectedVersion);
      const changes:FieldChange[]=[];for(const field of ['sourceDescription','sourceUrl','notes'] as const)if(current[field]!==fields[field])changes.push({field,previousValue:current[field],newValue:fields[field]});
      if(changes.length) {await this.updateAssociation(kind,id,{...fields,version:{increment:1}},tx);await this.record(targetOf(kind,id),actorId,changes,AuditAction.CONTACT_ASSOCIATION_UPDATED,tx);}
      return associationContract(await this.association(kind,id,tx));
    });
  }
  private async setAssociationState(kind:AssociationKind,id:string,current:AssociationRow,isActive:boolean,actorId:string,action:Parameters<AuditService['recordDirectory']>[0],tx:Prisma.TransactionClient,historyOptions?:HistoryRecordOptions) {
    if(current.isActive!==isActive) {await this.updateAssociation(kind,id,{isActive,version:{increment:1}},tx);await this.record(targetOf(kind,id),actorId,[{field:'isActive',previousValue:current.isActive,newValue:isActive}],action,tx,historyOptions);}
    return associationContract(await this.association(kind,id,tx));
  }
  async end(kind:AssociationKind,id:string,input:ContactEndDto,actorId:string) {
    return this.prisma.$transaction(async tx=>{await this.authorize(actorId,PERMISSIONS.DIRECTORY_WRITE,tx);const current=await this.lockedAssociation(kind,id,tx);assertVersion(current.version,input.expectedVersion);return this.setAssociationState(kind,id,current,false,actorId,AuditAction.CONTACT_ASSOCIATION_ENDED,tx);});
  }
  async status(kind:AssociationKind,id:string,input:DirectoryStatusDto,actorId:string) {
    return this.prisma.$transaction(async tx=>{await this.authorize(actorId,PERMISSIONS.DIRECTORY_WRITE,tx);const current=await this.lockedAssociation(kind,id,tx);assertVersion(current.version,input.expectedVersion);return this.setAssociationState(kind,id,current,input.isActive,actorId,AuditAction.CONTACT_ASSOCIATION_STATUS_CHANGED,tx);});
  }
  async replace(kind:AssociationKind,id:string,input:ContactReplacementDto,actorId:string) {
    if(!input.confirmed)throw new DirectoryError('INVALID_CONTACT_REPLACEMENT');const context=contactContext(input);
    return this.prisma.$transaction(async tx=>{
      await this.authorize(actorId,PERMISSIONS.DIRECTORY_WRITE,tx);const initial=await this.association(kind,id,tx);
      if(initial.contactMethodId===input.contactMethodId)throw new DirectoryError('INVALID_CONTACT_REPLACEMENT');
      for(const methodId of [initial.contactMethodId,input.contactMethodId].sort())await this.lockMethod(methodId,tx);
      const current=await this.lockedAssociation(kind,id,tx);assertVersion(current.version,input.expectedVersion);
      const target=await this.method(input.contactMethodId,tx);if(target.condition===ContactCondition.UNUSABLE)throw new DirectoryError('CONTACT_UNUSABLE');
      const historyOptions:HistoryRecordOptions={operationId:randomUUID(),replacement:{
        previous:{id:current.contactMethodId,kind:'contactMethod',label:current.contactMethod.value},next:{id:target.id,kind:'contactMethod',label:target.value}}};
      const result=await this.associateInTransaction(actorOf(current),target.id,context,actorId,tx,input.expectedMethodVersion,historyOptions);
      if(!result.association.isActive)throw new DirectoryError('INVALID_CONTACT_REPLACEMENT');
      const previous=await this.setAssociationState(kind,id,current,false,actorId,AuditAction.CONTACT_ASSOCIATION_ENDED,tx,historyOptions);
      return {...result,previous};
    });
  }
  async methodHistory(id:string,query:PageQueryDto) {await this.method(id);return this.directory.listHistory({contactMethodId:id},query);}
  async associationHistory(kind:AssociationKind,id:string,query:PageQueryDto) {await this.association(kind,id);return this.directory.listHistory(targetOf(kind,id),query);}
}
