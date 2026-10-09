import { randomUUID } from 'node:crypto';
import { PeopleService } from './people.service';
import type { PeopleQueryDto } from './people.dto';
import type { PrismaService } from '../../database/prisma.service';
import type { DirectoryHistoryService } from './directory-history.service';
import type { AuditService } from '../audit/audit.service';
import type { DirectoryService } from './directory.service';
import type { UsersService } from '../users/users.service';
import type { Prisma } from '../../generated/prisma/client';

type FakePerson = {id:string;displayName:string;givenNames:string|null;familyNames:string|null;isActive:boolean;version:number;duplicateOfId:string|null;
  createdAt:Date;updatedAt:Date;lastVerifiedAt:Date|null};
type FakeOrganization = {id:string;name:string;isActive:boolean;duplicateOfId:string|null};
type FakeEpisode = {id:string;personId:string;organizationId:string;positionTitle:string|null;area:string|null;isCurrent:boolean;startDate:Date|null;endDate:Date|null;
  sourceDescription:string|null;sourceUrl:string|null;notes:string|null;version:number;createdAt:Date;updatedAt:Date;lastVerifiedAt:Date|null;
  reconciliationTargets:never[];person:{id:string;displayName:string;isActive:boolean;duplicateOfId:string|null};organization:{id:string;name:string;isActive:boolean;duplicateOfId:string|null}};
type FakeState = {people:FakePerson[];organizations:FakeOrganization[];episodes:FakeEpisode[]};
const stamp=new Date('2026-10-09T12:00:00.000Z');
function newPerson(id:string,displayName:string):FakePerson {return {id,displayName,givenNames:null,familyNames:null,isActive:true,version:1,duplicateOfId:null,createdAt:stamp,updatedAt:stamp,lastVerifiedAt:null};}
function projection(person:FakePerson,state:FakeState) {return {...person,duplicateOf:null,consolidatedRecords:[],dataImportBatchId:null,dataImportBatch:null,
  relations:state.episodes.filter(row=>row.personId===person.id&&!row.isCurrent).slice(0,1).map(row=>({id:row.id})),
  _count:{relations:state.episodes.filter(row=>row.personId===person.id&&row.isCurrent).length}};}
function episode(data:Record<string,unknown>,state:FakeState):FakeEpisode {
  const person=state.people.find(row=>row.id===data.personId)!;
  const organization=state.organizations.find(row=>row.id===data.organizationId)!;
  return {...data,id:randomUUID(),version:1,createdAt:stamp,updatedAt:stamp,lastVerifiedAt:null,reconciliationTargets:[],
    person:{id:person.id,displayName:person.displayName,isActive:person.isActive,duplicateOfId:person.duplicateOfId},
    organization:{id:organization.id,name:organization.name,isActive:organization.isActive,duplicateOfId:organization.duplicateOfId}} as FakeEpisode;
}

function contextFixture(options:{people?:FakePerson[];organizations?:FakeOrganization[];episodes?:FakeEpisode[];failEpisode?:boolean;failHistoryAt?:number}={}) {
  let committed:FakeState={people:[...(options.people??[])],organizations:[...(options.organizations??[{id:'org-a',name:'Organización A',isActive:true,duplicateOfId:null},{id:'org-b',name:'Organización B',isActive:true,duplicateOfId:null}])],episodes:[...(options.episodes??[])]};
  let historyCalls=0;
  const history={record:jest.fn(()=>{historyCalls++;if(historyCalls===options.failHistoryAt)throw new Error('history write failed');return Promise.resolve(randomUUID());})};
  function transaction(state:FakeState) {
    return {
      organization:{findUnique:jest.fn(({where}:{where:{id:string}})=>Promise.resolve(state.organizations.find(row=>row.id===where.id)??null))},
      person:{
        create:jest.fn(({data}:{data:{displayName:string;givenNames:string|null;familyNames:string|null}})=>{const row=newPerson(randomUUID(),data.displayName);row.givenNames=data.givenNames;row.familyNames=data.familyNames;state.people.push(row);return Promise.resolve({id:row.id});}),
        findUnique:jest.fn(({where}:{where:{id:string}})=>{const row=state.people.find(person=>person.id===where.id);return Promise.resolve(row?projection(row,state):null);}),
      },
      personOrganizationRelation:{create:jest.fn(({data}:{data:Record<string,unknown>})=>{
        if(options.failEpisode)throw new Error('episode write failed');const row=episode(data,state);state.episodes.push(row);return Promise.resolve(row);
      })},
    };
  }
  const prisma={$transaction:jest.fn(async(work:(tx:unknown)=>Promise<unknown>)=>{
    const staged:FakeState={people:[...committed.people],organizations:committed.organizations,episodes:[...committed.episodes]};
    const result=await work(transaction(staged));committed=staged;return result;
  })} as unknown as PrismaService;
  const actors={lock:jest.fn(),writable:jest.fn()};
  const users={findIdentityById:jest.fn().mockResolvedValue({isActive:true,role:'RESEARCH'})};
  const service=new PeopleService(actors,prisma,users as unknown as UsersService,history as unknown as DirectoryHistoryService,
    {recordDirectory:jest.fn()} as unknown as AuditService,{} as DirectoryService);
  return {service,history,actors,get state(){return committed;}};
}

describe('Alta contextual de persona y clasificación institucional',()=>{
  it('crea persona y primer episodio, devuelve la situación derivada y registra historial en la transacción',async()=>{
    const fixture=contextFixture();
    const result=await fixture.service.createInOrganization('org-a',{
      personMode:'new',person:{displayName:'Ana contextual',givenNames:'Ana',familyNames:'Pérez'},positionTitle:'Coordinadora',area:'Cooperación',isCurrent:true,
    },'actor');
    expect(fixture.state.people).toHaveLength(1);expect(fixture.state.episodes).toHaveLength(1);
    expect(result.person).toMatchObject({id:fixture.state.people[0].id,displayName:'Ana contextual',currentRelationsCount:1,institutionalStatus:'CURRENT',lastVerifiedAt:null});
    expect(result.relation).toMatchObject({personId:result.person.id,organizationId:'org-a',positionTitle:'Coordinadora',area:'Cooperación',isCurrent:true});
    expect(fixture.history.record.mock.calls).toHaveLength(2);
  });
  it('reutiliza la identidad existente y conserva sus episodios históricos',async()=>{
    const person=newPerson('person-existing','Persona previamente independiente');
    const old:FakeEpisode={id:'episode-old',personId:person.id,organizationId:'org-a',positionTitle:'Asesora',area:null,isCurrent:false,startDate:null,endDate:null,
      sourceDescription:null,sourceUrl:null,notes:null,version:1,createdAt:stamp,updatedAt:stamp,lastVerifiedAt:null,reconciliationTargets:[],
      person:{id:person.id,displayName:person.displayName,isActive:true,duplicateOfId:null},organization:{id:'org-a',name:'Organización A',isActive:true,duplicateOfId:null}};
    const fixture=contextFixture({people:[person],episodes:[old]});
    const result=await fixture.service.createInOrganization('org-b',{personMode:'existing',personId:person.id,positionTitle:'Directora',isCurrent:true},'actor');
    expect(fixture.state.people).toHaveLength(1);expect(fixture.state.episodes).toHaveLength(2);
    expect(fixture.state.episodes[0]).toEqual(old);expect(result.person).toMatchObject({id:person.id,currentRelationsCount:1,institutionalStatus:'CURRENT'});
    expect(result.relation).toMatchObject({personId:person.id,organizationId:'org-b',positionTitle:'Directora'});
    expect(fixture.history.record.mock.calls).toHaveLength(1);expect(fixture.actors.writable.mock.calls).toContainEqual(['person',person.id,expect.anything()]);
  });
  it.each([
    ['falla el episodio',{failEpisode:true}],['falla el historial del episodio',{failHistoryAt:2}],
  ] as const)('%s y revierte la persona y las escrituras previas',async(_label,options)=>{
    const fixture=contextFixture(options);
    await expect(fixture.service.createInOrganization('org-a',{personMode:'new',person:{displayName:'No persistir',givenNames:'Prueba'},isCurrent:true},'actor')).rejects.toThrow();
    expect(fixture.state.people).toHaveLength(0);expect(fixture.state.episodes).toHaveLength(0);
  });
  it.each([
    ['all',{}],['without-current',{relations:{none:{isCurrent:true}}}],['none',{relations:{none:{}}}],
    ['historical-only',{AND:[{relations:{some:{isCurrent:false}}},{relations:{none:{isCurrent:true}}}]}],['current',{relations:{some:{isCurrent:true}}}],
  ] as const)('aplica el filtro %s a la consulta paginada combinada',async(institutionalStatus,expected)=>{
    let findManyArgs:Prisma.PersonFindManyArgs|undefined,countArgs:Prisma.PersonCountArgs|undefined;
    const findMany=jest.fn((args:Prisma.PersonFindManyArgs)=>{findManyArgs=args;return Promise.resolve([]);});
    const count=jest.fn((args:Prisma.PersonCountArgs)=>{countArgs=args;return Promise.resolve(0);});
    const prisma={person:{findMany,count},$transaction:jest.fn(async(queries:Promise<unknown>[])=>Promise.all(queries))} as unknown as PrismaService;
    const service=new PeopleService({lock:jest.fn(),writable:jest.fn()},prisma,{findIdentityById:jest.fn()} as unknown as UsersService,
      {} as DirectoryHistoryService,{} as AuditService,{} as DirectoryService);
    const query={page:2,pageSize:10,status:'inactive',name:'Ana',institutionalStatus} as PeopleQueryDto;
    await service.list(query);
    if(!findManyArgs||!countArgs)throw new Error('La consulta no fue ejecutada.');
    expect(findManyArgs.where).toEqual({isActive:false,displayName:{contains:'Ana',mode:'insensitive'},...expected});
    expect(countArgs.where).toEqual(findManyArgs.where);
    expect(findManyArgs).toMatchObject({skip:10,take:10});
  });
  it('incluye el estado derivado en el contrato sin exponer episodios de apoyo',async()=>{
    const rows=[
      {...projection(newPerson('p-none','Sin vínculos'),{people:[],organizations:[],episodes:[]}),_count:{relations:0},relations:[]},
      {...projection(newPerson('p-history','Solo históricos'),{people:[],organizations:[],episodes:[]}),_count:{relations:0},relations:[{id:'old'}]},
      {...projection(newPerson('p-current','Vigente'),{people:[],organizations:[],episodes:[]}),_count:{relations:2},relations:[{id:'old'}]},
    ];
    const prisma={person:{findMany:jest.fn().mockResolvedValue(rows),count:jest.fn().mockResolvedValue(rows.length)},$transaction:jest.fn(async(queries:Promise<unknown>[])=>Promise.all(queries))} as unknown as PrismaService;
    const service=new PeopleService({lock:jest.fn(),writable:jest.fn()},prisma,{findIdentityById:jest.fn()} as unknown as UsersService,
      {} as DirectoryHistoryService,{} as AuditService,{} as DirectoryService);
    const result=await service.list({page:1,pageSize:25,status:'all',name:'',institutionalStatus:'all'});
    expect(result.items.map(item=>item.institutionalStatus)).toEqual(['NO_KNOWN_LINKS','HISTORICAL_ONLY','CURRENT']);
    expect(result.items[0]).not.toHaveProperty('relations');
  });
});
