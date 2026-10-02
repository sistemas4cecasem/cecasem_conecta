import { ContactsService } from './contacts.service';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { DirectoryHistoryService } from './directory-history.service';
import { DirectoryService } from './directory.service';
import { AuditService } from '../audit/audit.service';
import { ContactCondition,ContactType,UserRole } from '../../generated/prisma/client';
describe('Corrección global y asociación explícita',()=>{
  let service:ContactsService;
  let record:jest.Mock<Promise<string>,Parameters<DirectoryHistoryService['record']>>;
  let current:{id:string;type:ContactType;value:string;label:string|null;condition:ContactCondition;version:number;createdAt:Date;updatedAt:Date;_count:{people:number;organizations:number}};
  let existing:boolean,duplicate:boolean;
  beforeEach(()=>{
    existing=false;duplicate=false;current={id:'method',type:ContactType.EMAIL,value:'persona@example.test',label:null,condition:ContactCondition.USABLE,version:2,createdAt:new Date(),updatedAt:new Date(),_count:{people:1,organizations:1}};
    record=jest.fn<Promise<string>,Parameters<DirectoryHistoryService['record']>>().mockResolvedValue('operation');
    const row=()=>({id:'association',personId:'person',contactMethodId:current.id,sourceDescription:'Fuente original',sourceUrl:null,notes:'Contexto original',isActive:false,version:3,createdAt:new Date(0),updatedAt:new Date(0),lastVerifiedAt:null,person:{id:'person',displayName:'Persona',isActive:true},contactMethod:current});
    const tx={$queryRaw:jest.fn().mockResolvedValue([]),person:{findUnique:jest.fn().mockResolvedValue({id:'person'})},
      contactMethod:{findUnique:jest.fn().mockImplementation(()=>Promise.resolve(current)),findFirst:jest.fn().mockImplementation(()=>Promise.resolve(duplicate?{id:'other'}:null)),update:jest.fn().mockImplementation(({data}:{data:{value?:string;label?:string|null;version:{increment:number}}})=>{current={...current,...(data.value?{value:data.value}:{}),...(data.label!==undefined?{label:data.label}:{}),version:current.version+data.version.increment};return Promise.resolve(current);})},
      personContact:{findUnique:jest.fn().mockImplementation(()=>Promise.resolve(existing?row():null))},
    };
    service=new ContactsService({...tx,$transaction:(work:(client:typeof tx)=>unknown)=>work(tx)} as unknown as PrismaService,
      {findIdentityById:jest.fn().mockResolvedValue({isActive:true,role:UserRole.RESEARCH})} as unknown as UsersService,{record},
      {recordDirectory:jest.fn()} as unknown as AuditService,{} as DirectoryService);
  });
  it('asociación repetida inactiva conserva contexto, versión y estado sin historial',async()=>{
    existing=true;const result=await service.associate({personId:'person'},'method',{expectedMethodVersion:1,notes:'No reemplazar'},'actor');
    expect(result).toMatchObject({outcome:'existing',association:{isActive:false,version:3,notes:'Contexto original'}});expect(record).not.toHaveBeenCalled();
  });
  it('medio compartido requiere decisión explícita antes de cambiar globalmente',async()=>{
    await expect(service.correct('method',{value:'nuevo@example.test',expectedVersion:2,confirmShared:false},'actor')).rejects.toMatchObject({code:'SHARED_CONTACT_CONFIRMATION_REQUIRED'});
    expect(current.value).toBe('persona@example.test');expect(record).not.toHaveBeenCalled();
  });
  it('corrección confirmada guarda valor anterior/nuevo en el medio, sin reescribir contexto',async()=>{
    const result=await service.correct('method',{value:'nuevo@example.test',expectedVersion:2,confirmShared:true},'actor');expect(result.value).toBe('nuevo@example.test');
    expect(record.mock.calls[0]?.[0]).toEqual({contactMethodId:'method'});expect(record.mock.calls[0]?.[2]).toContainEqual({field:'value',previousValue:'persona@example.test',newValue:'nuevo@example.test'});
  });
  it('versión antigua no corrige un canal actualizado',async()=>{await expect(service.correct('method',{value:'nuevo@example.test',expectedVersion:1,confirmShared:true},'actor')).rejects.toMatchObject({code:'VERSION_CONFLICT'});expect(current.version).toBe(2);});
  it('corrección hacia otro correo canónico ofrece su identidad sin fusionar',async()=>{duplicate=true;await expect(service.correct('method',{value:'otro@example.test',expectedVersion:2,confirmShared:true},'actor')).rejects.toMatchObject({code:'CONTACT_VALUE_EXISTS',details:{contactMethodId:'other'}});expect(record).not.toHaveBeenCalled();});
  it('normalización equivalente no fabrica una corrección global ni nueva versión',async()=>{const row=await service.correct('method',{value:' PERSONA@EXAMPLE.TEST ',expectedVersion:2,confirmShared:false},'actor');expect(row.version).toBe(2);expect(record).not.toHaveBeenCalled();});
  it('no asocia un medio que cambió después de que el usuario lo revisó',async()=>{await expect(service.associate({personId:'person'},'method',{expectedMethodVersion:1},'actor')).rejects.toMatchObject({code:'VERSION_CONFLICT'});expect(record).not.toHaveBeenCalled();});
});
