import type { Prisma } from '../../generated/prisma/client';
import { UserRole } from '../../generated/prisma/client';
import type { UserCredentials } from '../users/user-projections';
import { UsersService } from '../users/users.service';
import { PasswordService, InvalidNewPasswordError } from './password.service';
import { SessionsService } from './sessions.service';
import { RequiredPasswordChangeService, RequiredPasswordChangeUnavailableError } from './required-password-change.service';
import { ReusedPasswordError } from './password-reset.errors';

describe('Cambio obligatorio: validación y relectura bajo lock',()=>{
  const password='Aa!personal';const tx={} as Prisma.TransactionClient;
  const credential:UserCredentials={id:'fixture',givenNames:'Ana',familyNames:'Prueba',username:'ana.prueba',email:'fixture@example.test',role:UserRole.RESEARCH,isActive:true,passwordHash:'initial-hash',mustChangePassword:true,createdAt:new Date(),updatedAt:new Date(),deactivatedAt:null};
  let locked:UserCredentials|null;const replace=jest.fn();const find=jest.fn();const verify=jest.fn();const hash=jest.fn();const revoke=jest.fn();const create=jest.fn();const lock=jest.fn();let service:RequiredPasswordChangeService;
  beforeEach(()=>{jest.resetAllMocks();locked={...credential};find.mockResolvedValue({...credential});verify.mockResolvedValue(false);hash.mockResolvedValue('new-hash');replace.mockResolvedValue(true);create.mockResolvedValue('rotated-session');
    lock.mockImplementation(async(_id:string,operation:(user:UserCredentials|null,tx:Prisma.TransactionClient)=>Promise<string>)=>operation(locked,tx));
    service=new RequiredPasswordChangeService({findCredentialsById:find,withLockedCredentials:lock,replaceRequiredPassword:replace} as unknown as UsersService,{verify,hashNew:hash} as unknown as PasswordService,{revokeAllForUser:revoke,create} as unknown as SessionsService);
  });
  it.each(['Aa!1234','aa!12345','AA!12345','Aa123456'])('política inválida se rechaza antes de persistencia',async value=>{await expect(service.change(credential.id,value)).rejects.toBeInstanceOf(InvalidNewPasswordError);expect(find).not.toHaveBeenCalled();expect(lock).not.toHaveBeenCalled();});
  it.each([null,{...credential,isActive:false},{...credential,passwordHash:null},{...credential,mustChangePassword:false}])('estado inicial no habilitado no hashea ni escribe',async value=>{find.mockResolvedValue(value);await expect(service.change(credential.id,password)).rejects.toBeInstanceOf(RequiredPasswordChangeUnavailableError);expect(hash).not.toHaveBeenCalled();expect(lock).not.toHaveBeenCalled();});
  it('reutilización se comprueba antes de hashear',async()=>{verify.mockResolvedValue(true);await expect(service.change(credential.id,password)).rejects.toBeInstanceOf(ReusedPasswordError);expect(hash).not.toHaveBeenCalled();});
  it.each([null,{...credential,isActive:false},{...credential,passwordHash:null},{...credential,mustChangePassword:false},{...credential,passwordHash:'changed-hash'}])('relectura obsoleta no sobrescribe ni revoca',async value=>{locked=value;await expect(service.change(credential.id,password)).rejects.toBeInstanceOf(RequiredPasswordChangeUnavailableError);expect(replace).not.toHaveBeenCalled();expect(revoke).not.toHaveBeenCalled();});
  it('reemplazo condicional fallido no crea sesión',async()=>{replace.mockResolvedValue(false);await expect(service.change(credential.id,password)).rejects.toBeInstanceOf(RequiredPasswordChangeUnavailableError);expect(revoke).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();});
  it('reemplaza, revoca y rota en la misma transacción y orden',async()=>{await expect(service.change(credential.id,password)).resolves.toBe('rotated-session');expect(replace).toHaveBeenCalledWith(credential.id,credential.passwordHash,'new-hash',tx);expect(revoke).toHaveBeenCalledWith(credential.id,tx);expect(create).toHaveBeenCalledWith(credential.id,tx);expect(replace.mock.invocationCallOrder[0]).toBeLessThan(revoke.mock.invocationCallOrder[0]);expect(revoke.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]);});
});
