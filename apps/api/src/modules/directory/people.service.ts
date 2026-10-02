import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { PERMISSIONS, type Permission } from '../auth/authorization/permission';
import { hasPermission } from '../auth/authorization/role-permissions';
import { DirectoryHistoryService, type FieldChange, type HistoryValue } from './directory-history.service';
import { DirectoryService } from './directory.service';
import { DirectoryError } from './directory.errors';
import { assertVersion } from './directory.rules';
import { calendarDate, personFields, relationFields } from './people.rules';
import type { DirectoryStatusDto, PageQueryDto } from './directory.dto';
import type { PeopleQueryDto, PersonEditDto, PersonInputDto, RelationCreateDto, RelationEditDto, RelationEndDto, RelationsQueryDto } from './people.dto';

const personSelect = { id:true, displayName:true, givenNames:true, familyNames:true, isActive:true, version:true,
  createdAt:true, updatedAt:true, lastVerifiedAt:true, _count:{select:{relations:{where:{isCurrent:true}}}} } satisfies Prisma.PersonSelect;
const relationSelect = { id:true, personId:true, organizationId:true, positionTitle:true, area:true, isCurrent:true, startDate:true, endDate:true,
  sourceDescription:true, sourceUrl:true, notes:true, version:true, createdAt:true, updatedAt:true,
  person:{select:{id:true,displayName:true,isActive:true}}, organization:{select:{id:true,name:true,isActive:true}} } satisfies Prisma.PersonOrganizationRelationSelect;
type PersonRow = Prisma.PersonGetPayload<{select:typeof personSelect}>;
type RelationRow = Prisma.PersonOrganizationRelationGetPayload<{select:typeof relationSelect}>;
function personContract(row:PersonRow) { const {_count,...fields}=row; return {...fields,currentRelationsCount:_count.relations}; }
function dateValue(value:Date|null) { return value?.toISOString().slice(0,10) ?? null; }
function relationContract(row:RelationRow) { return {...row,startDate:dateValue(row.startDate),endDate:dateValue(row.endDate)}; }
function paging(query:PageQueryDto) { return {skip:(query.page-1)*query.pageSize,take:query.pageSize}; }
function historyValue(value:string|boolean|Date|null):HistoryValue { return value instanceof Date ? dateValue(value) : value; }

@Injectable()
export class PeopleService {
  constructor(private readonly prisma:PrismaService, private readonly users:UsersService, private readonly history:DirectoryHistoryService,
    private readonly audit:AuditService, private readonly directory:DirectoryService) {}
  private async authorize(actorId:string, permission:Permission, tx:Prisma.TransactionClient) {
    const actor=await this.users.findIdentityById(actorId,tx);
    if(!actor?.isActive || !hasPermission(actor.role,permission)) throw new DirectoryError('FORBIDDEN');
  }
  private async person(id:string,tx:Prisma.TransactionClient=this.prisma) {
    const row=await tx.person.findUnique({where:{id},select:personSelect});
    if(!row) throw new DirectoryError('PERSON_NOT_FOUND'); return row;
  }
  private async relation(id:string,tx:Prisma.TransactionClient=this.prisma) {
    const row=await tx.personOrganizationRelation.findUnique({where:{id},select:relationSelect});
    if(!row) throw new DirectoryError('PERSON_RELATION_NOT_FOUND'); return row;
  }
  async list(query:PeopleQueryDto) {
    const where:Prisma.PersonWhereInput={...(query.status==='all'?{}:{isActive:query.status==='active'}),
      ...(query.name?{displayName:{contains:query.name,mode:'insensitive'}}:{})};
    const [rows,total]=await this.prisma.$transaction([this.prisma.person.findMany({where,select:personSelect,orderBy:[{displayName:'asc'},{id:'asc'}],...paging(query)}),
      this.prisma.person.count({where})],{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
    return {items:rows.map(personContract),total,page:query.page,pageSize:query.pageSize};
  }
  async get(id:string) {return personContract(await this.person(id));}
  async create(input:PersonInputDto,actorId:string) {
    const fields=personFields(input);
    return this.prisma.$transaction(async tx=>{await this.authorize(actorId,PERMISSIONS.DIRECTORY_WRITE,tx);
      return personContract(await tx.person.create({data:fields,select:personSelect}));});
  }
  async edit(id:string,input:PersonEditDto,actorId:string) {
    const fields=personFields(input);
    return this.prisma.$transaction(async tx=>{
      await this.authorize(actorId,PERMISSIONS.DIRECTORY_WRITE,tx);
      await tx.$queryRaw`SELECT id FROM "Person" WHERE id=${id}::uuid FOR UPDATE`;
      const current=await this.person(id,tx); assertVersion(current.version,input.expectedVersion);
      const changes:FieldChange[]=[];
      for(const field of ['displayName','givenNames','familyNames'] as const) if(current[field]!==fields[field]) changes.push({field,previousValue:current[field],newValue:fields[field]});
      if(!changes.length) return personContract(current);
      await tx.person.update({where:{id},data:{...fields,version:{increment:1}}});
      const operationId=await this.history.record({personId:id},actorId,changes,tx);
      await this.audit.recordDirectory(AuditAction.PERSON_UPDATED,{personId:id},actorId,operationId,tx);
      return personContract(await this.person(id,tx));
    });
  }
  async status(id:string,input:DirectoryStatusDto,actorId:string) {
    return this.prisma.$transaction(async tx=>{
      await this.authorize(actorId,PERMISSIONS.DIRECTORY_STATUS_UPDATE,tx);
      await tx.$queryRaw`SELECT id FROM "Person" WHERE id=${id}::uuid FOR UPDATE`;
      const current=await this.person(id,tx); assertVersion(current.version,input.expectedVersion);
      if(current.isActive===input.isActive) return personContract(current);
      await tx.person.update({where:{id},data:{isActive:input.isActive,version:{increment:1}}});
      const operationId=await this.history.record({personId:id},actorId,[{field:'isActive',previousValue:current.isActive,newValue:input.isActive}],tx);
      await this.audit.recordDirectory(AuditAction.PERSON_STATUS_CHANGED,{personId:id},actorId,operationId,tx);
      return personContract(await this.person(id,tx));
    });
  }
  async personHistory(id:string,query:PageQueryDto) {await this.person(id);return this.directory.listHistory({personId:id},query);}
  async getRelation(id:string) {return relationContract(await this.relation(id));}
  async relationsOfPerson(id:string,query:RelationsQueryDto) {await this.person(id);return this.listRelations({personId:id},query);}
  async relationsOfOrganization(id:string,query:RelationsQueryDto) {await this.directory.getOrganization(id);return this.listRelations({organizationId:id},query);}
  private async listRelations(target:{personId:string}|{organizationId:string},query:RelationsQueryDto) {
    const where={...target,...(query.status==='all'?{}:{isCurrent:query.status==='current'})};
    const [rows,total]=await this.prisma.$transaction([
      this.prisma.personOrganizationRelation.findMany({where,select:relationSelect,orderBy:[{createdAt:'desc'},{id:'desc'}],...paging(query)}),
      this.prisma.personOrganizationRelation.count({where})],{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
    return {items:rows.map(relationContract),total,page:query.page,pageSize:query.pageSize};
  }
  async createRelation(personId:string,input:RelationCreateDto,actorId:string) {
    const fields=relationFields(input);
    return this.prisma.$transaction(async tx=>{
      await this.authorize(actorId,PERMISSIONS.DIRECTORY_WRITE,tx);await this.person(personId,tx);
      if(!await tx.organization.findUnique({where:{id:input.organizationId},select:{id:true}})) throw new DirectoryError('ORGANIZATION_NOT_FOUND');
      return relationContract(await tx.personOrganizationRelation.create({data:{...fields,personId,organizationId:input.organizationId},select:relationSelect}));
    });
  }
  async editRelation(id:string,input:RelationEditDto,actorId:string) {
    const fields=relationFields(input);
    return this.changeRelation(id,input.expectedVersion,actorId,()=>fields,AuditAction.PERSON_RELATION_UPDATED);
  }
  async endRelation(id:string,input:RelationEndDto,actorId:string) {
    const endDate=calendarDate(input.endDate);
    return this.changeRelation(id,input.expectedVersion,actorId,current=>{
      // Repetir la finalización con la versión vigente no corrige ni reemplaza una fecha existente.
      if(!current.isCurrent) return {isCurrent:false,endDate:current.endDate};
      if(current.startDate && endDate && current.startDate>endDate) throw new DirectoryError('INVALID_DIRECTORY');
      return {isCurrent:false,endDate};
    },AuditAction.PERSON_RELATION_ENDED);
  }
  private async changeRelation(id:string,expectedVersion:number,actorId:string,
    resolve:(current:RelationRow)=>Partial<ReturnType<typeof relationFields>>,action:typeof AuditAction.PERSON_RELATION_UPDATED|typeof AuditAction.PERSON_RELATION_ENDED) {
    return this.prisma.$transaction(async tx=>{
      await this.authorize(actorId,PERMISSIONS.DIRECTORY_WRITE,tx);
      await this.lockRelation(id,tx);
      const current=await this.relation(id,tx);assertVersion(current.version,expectedVersion);
      const fields=resolve(current); const changes:FieldChange[]=[];
      for(const field of ['positionTitle','area','isCurrent','startDate','endDate','sourceDescription','sourceUrl','notes'] as const) {
        const next=fields[field];if(next===undefined) continue;
        const previousValue=historyValue(current[field]),newValue=historyValue(next);
        if(previousValue!==newValue) changes.push({field,previousValue,newValue});
      }
      if(!changes.length) return relationContract(current);
      await tx.personOrganizationRelation.update({where:{id},data:{...fields,version:{increment:1}}});
      const operationId=await this.history.record({personRelationId:id},actorId,changes,tx);
      await this.audit.recordDirectory(action,{personRelationId:id},actorId,operationId,tx);
      return relationContract(await this.relation(id,tx));
    });
  }
  async lockRelation(id:string,tx:Prisma.TransactionClient) {await tx.$queryRaw`SELECT id FROM "PersonOrganizationRelation" WHERE id=${id}::uuid FOR UPDATE`;}
  async relationHistory(id:string,query:PageQueryDto) {await this.relation(id);return this.directory.listHistory({personRelationId:id},query);}
}
