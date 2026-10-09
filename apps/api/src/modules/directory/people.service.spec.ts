import { randomUUID } from 'node:crypto';
import { PeopleService } from './people.service';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { DirectoryHistoryService } from './directory-history.service';
import { AuditService } from '../audit/audit.service';
import { DirectoryService } from './directory.service';
import { UserRole } from '../../generated/prisma/client';
import type { RelationCreateDto } from './people.dto';
type Episode = {id:string;personId:string;organizationId:string;positionTitle:string|null;area:string|null;isCurrent:boolean;startDate:Date|null;endDate:Date|null;sourceDescription:string|null;sourceUrl:string|null;notes:string|null;version:number;createdAt:Date;updatedAt:Date;person:{id:string;displayName:string;isActive:boolean};organization:{id:string;name:string;isActive:boolean}};
describe('Episodios institucionales en aplicación',()=>{
  let service:PeopleService;let episodes:Map<string,Episode>;let record:jest.Mock<Promise<string>,Parameters<DirectoryHistoryService['record']>>;
  const personId=randomUUID(),actorId=randomUUID(),orgA=randomUUID(),orgB=randomUUID();
  beforeEach(()=>{
    episodes=new Map();record=jest.fn<Promise<string>,Parameters<DirectoryHistoryService['record']>>().mockResolvedValue(randomUUID());
    const tx={
      $queryRaw:jest.fn().mockResolvedValue([]),
      person:{findUnique:jest.fn().mockImplementation(()=>Promise.resolve({id:personId,displayName:'Ana',givenNames:null,familyNames:null,isActive:true,version:1,createdAt:new Date(),updatedAt:new Date(),lastVerifiedAt:null,
        relations:[...episodes.values()].filter(row=>!row.isCurrent).slice(0,1).map(row=>({id:row.id})),_count:{relations:[...episodes.values()].filter(row=>row.isCurrent).length}}))},
      organization:{findUnique:jest.fn().mockResolvedValue({id:orgA})},
      personOrganizationRelation:{
        create:jest.fn().mockImplementation(({data}:{data:RelationCreateDto&{personId:string}})=>{const row={...data,id:randomUUID(),version:1,createdAt:new Date(),updatedAt:new Date(),person:{id:personId,displayName:'Ana',isActive:true},organization:{id:data.organizationId,name:'Organización',isActive:true}} as unknown as Episode;episodes.set(row.id,row);return Promise.resolve(row);}),
        findUnique:jest.fn().mockImplementation(({where}:{where:{id:string}})=>Promise.resolve(episodes.get(where.id))),
        update:jest.fn().mockImplementation(({where,data}:{where:{id:string};data:Partial<Episode>&{version:{increment:number}}})=>{const row=episodes.get(where.id)!;const updated={...row,...data,version:row.version+data.version.increment};episodes.set(row.id,updated);return Promise.resolve(updated);}),
      },
    };
    const prisma={...tx,$transaction:(work:(value:typeof tx)=>unknown)=>work(tx)} as unknown as PrismaService;
    service=new PeopleService({lock:jest.fn(),writable:jest.fn()},prisma,{findIdentityById:jest.fn().mockResolvedValue({isActive:true,role:UserRole.RESEARCH})} as unknown as UsersService,
      {record} as unknown as DirectoryHistoryService,{recordDirectory:jest.fn()} as unknown as AuditService,{} as DirectoryService);
  });
  it('independiente puede adquirir dos organizaciones simultáneas sin sustituir ninguna',async()=>{
    expect((await service.get(personId)).currentRelationsCount).toBe(0);
    await service.createRelation(personId,{organizationId:orgA,isCurrent:true,positionTitle:'Consultora'},actorId);
    await service.createRelation(personId,{organizationId:orgB,isCurrent:true,positionTitle:'Directora'},actorId);
    expect(episodes.size).toBe(2);expect((await service.get(personId)).currentRelationsCount).toBe(2);expect(record).toHaveBeenCalledTimes(2);
  });
  it('fin y regreso a misma organización son episodios distintos; no inventa fecha',async()=>{
    const first=await service.createRelation(personId,{organizationId:orgA,isCurrent:true,positionTitle:'Coordinadora'},actorId);
    const ended=await service.endRelation(first.id,{expectedVersion:1},actorId);
    const second=await service.createRelation(personId,{organizationId:orgA,isCurrent:true,positionTitle:'Directora'},actorId);
    expect(first.id).not.toBe(second.id);expect(ended).toMatchObject({isCurrent:false,endDate:null,positionTitle:'Coordinadora',version:2});expect(episodes.size).toBe(2);
  });
  it('corregir conserva identidad del episodio y registra cargo anterior/nuevo',async()=>{
    const row=await service.createRelation(personId,{organizationId:orgA,isCurrent:true,positionTitle:'Coordinador'},actorId);
    const corrected=await service.editRelation(row.id,{expectedVersion:1,isCurrent:true,positionTitle:'Coordinadora'},actorId);
    expect(corrected).toMatchObject({id:row.id,positionTitle:'Coordinadora',version:2});expect(episodes.size).toBe(1);
    expect(record.mock.calls.at(-1)?.[2]).toContainEqual({field:'positionTitle',previousValue:'Coordinador',newValue:'Coordinadora'});
  });
  it('una versión anterior no puede reabrir ni corregir después de finalizar',async()=>{
    const row=await service.createRelation(personId,{organizationId:orgA,isCurrent:true},actorId);await service.endRelation(row.id,{expectedVersion:1},actorId);
    await expect(service.editRelation(row.id,{expectedVersion:1,isCurrent:true},actorId)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
    expect(episodes.get(row.id)?.isCurrent).toBe(false);expect(record).toHaveBeenCalledTimes(2);
  });
});
