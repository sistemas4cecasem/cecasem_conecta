import { type ExecutionContext, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../../generated/prisma/client';
import { AuthController } from '../auth.controller';
import { publicIdentity } from '../auth.dto';
import { SessionGuard } from '../session.guard';
import { HealthController } from '../../health/health.controller';
import type { UserIdentity } from '../../users/user-projections';
import { PERMISSIONS, type Permission, REQUIRED_PERMISSIONS_KEY } from './permission';
import { getRolePermissions, hasAllPermissions, hasPermission } from './role-permissions';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './require-permissions.decorator';

const both = [PERMISSIONS.FIRST_ACCESS_ISSUE, PERMISSIONS.PASSWORD_RESET_ISSUE];
const opportunityPermissions = [PERMISSIONS.OPPORTUNITY_READ, PERMISSIONS.OPPORTUNITY_CREATE, PERMISSIONS.OPPORTUNITY_UPDATE, PERMISSIONS.OPPORTUNITY_STATE_CHANGE, PERMISSIONS.OPPORTUNITY_DISCARD, PERMISSIONS.OPPORTUNITY_FINISH];
const filePermissions = [PERMISSIONS.FILE_READ, PERMISSIONS.FILE_UPLOAD];
const communicationPermissions = [PERMISSIONS.TRANSLATION_READ, PERMISSIONS.TRANSLATION_REQUEST, PERMISSIONS.COMMUNICATION_READ, PERMISSIONS.SENT_COMMUNICATION_CREATE, PERMISSIONS.RECEIVED_COMMUNICATION_CREATE, PERMISSIONS.COMMUNICATION_AMEND, PERMISSIONS.COMMUNICATION_INVALIDATE];
const restrictionPermissions = [PERMISSIONS.RESTRICTION_READ, PERMISSIONS.RESTRICTION_CREATE];
const processPermissions = [PERMISSIONS.PROCESS_READ, PERMISSIONS.PROCESS_CREATE, PERMISSIONS.PROCESS_STATE_CHANGE, PERMISSIONS.PROCESS_CLOSE, PERMISSIONS.PROCESS_REOPEN, PERMISSIONS.INTERNAL_NOTE_CREATE];
const intentPermissions = [PERMISSIONS.INTENT_READ, PERMISSIONS.INTENT_CREATE, PERMISSIONS.INTENT_CANCEL, PERMISSIONS.INTENT_CONVERT];
const directoryPermissions = [PERMISSIONS.DIRECTORY_READ, PERMISSIONS.DIRECTORY_WRITE, PERMISSIONS.DIRECTORY_HISTORY_READ, PERMISSIONS.DIRECTORY_VERIFY, PERMISSIONS.DIRECTORY_DUPLICATES_DISMISS];
const allPermissions = [PERMISSIONS.FIRST_ACCESS_ISSUE, PERMISSIONS.PASSWORD_RESET_ISSUE, PERMISSIONS.DATA_IMPORT_EXECUTE, PERMISSIONS.USERS_READ,
  PERMISSIONS.USERS_DEACTIVATED_READ, PERMISSIONS.USERS_CREATE, PERMISSIONS.USERS_ROLE_UPDATE,
  PERMISSIONS.USERS_STATUS_UPDATE, PERMISSIONS.USERS_MAILBOXES_MANAGE, ...directoryPermissions, PERMISSIONS.DIRECTORY_STATUS_UPDATE, PERMISSIONS.SETTINGS_VERIFICATION_UPDATE, PERMISSIONS.SETTINGS_REMINDERS_UPDATE, PERMISSIONS.DIRECTORY_DUPLICATES_MANAGE, ...intentPermissions, ...processPermissions, ...restrictionPermissions, ...communicationPermissions, PERMISSIONS.RESTRICTION_LIFT, ...filePermissions, ...opportunityPermissions, PERMISSIONS.NOTIFICATION_READ, PERMISSIONS.NOTIFICATION_MARK_READ, PERMISSIONS.REFERRAL_READ, PERMISSIONS.REFERRAL_CREATE, PERMISSIONS.MEETING_READ, PERMISSIONS.MEETING_CREATE, PERMISSIONS.MEETING_UPDATE, PERMISSIONS.MEETING_PARTICIPANTS, PERMISSIONS.MEETING_RESULTS];
const reflector = new Reflector();

// Se inspecciona metadata del método original, sin invocarlo ni hacer bind.
function methodHandler(prototype: object, method: string): ReturnType<ExecutionContext['getHandler']> {
  const handler: unknown = Reflect.get(prototype, method);
  if (typeof handler !== 'function') throw new Error(`Método inexistente: ${method}`);
  return handler;
}

describe('RBAC explícito y sin bypass', () => {
  it.each([
    [UserRole.ADMINISTRATOR, allPermissions], [UserRole.BOARD, [PERMISSIONS.USERS_READ, ...directoryPermissions, ...intentPermissions, ...processPermissions, ...restrictionPermissions, ...communicationPermissions, PERMISSIONS.RESTRICTION_LIFT, ...filePermissions, ...opportunityPermissions, PERMISSIONS.NOTIFICATION_READ, PERMISSIONS.NOTIFICATION_MARK_READ, PERMISSIONS.REFERRAL_READ, PERMISSIONS.REFERRAL_CREATE, PERMISSIONS.MEETING_READ, PERMISSIONS.MEETING_CREATE, PERMISSIONS.MEETING_UPDATE, PERMISSIONS.MEETING_PARTICIPANTS, PERMISSIONS.MEETING_RESULTS]], [UserRole.RESEARCH, [...directoryPermissions, ...intentPermissions, ...processPermissions, ...restrictionPermissions, ...communicationPermissions, ...filePermissions, ...opportunityPermissions, PERMISSIONS.NOTIFICATION_READ, PERMISSIONS.NOTIFICATION_MARK_READ, PERMISSIONS.REFERRAL_READ, PERMISSIONS.REFERRAL_CREATE, PERMISSIONS.MEETING_READ, PERMISSIONS.MEETING_CREATE, PERMISSIONS.MEETING_UPDATE, PERMISSIONS.MEETING_PARTICIPANTS, PERMISSIONS.MEETING_RESULTS]], [UserRole.PLANNING, [...directoryPermissions, ...intentPermissions, ...processPermissions, ...restrictionPermissions, ...communicationPermissions, ...filePermissions, ...opportunityPermissions, PERMISSIONS.NOTIFICATION_READ, PERMISSIONS.NOTIFICATION_MARK_READ, PERMISSIONS.REFERRAL_READ, PERMISSIONS.REFERRAL_CREATE, PERMISSIONS.MEETING_READ, PERMISSIONS.MEETING_CREATE, PERMISSIONS.MEETING_UPDATE, PERMISSIONS.MEETING_PARTICIPANTS, PERMISSIONS.MEETING_RESULTS]],
  ])('%s conserva su lista explícita', (role, expected) => {
    expect(getRolePermissions(role)).toEqual(expected);
    expect(hasPermission(role, PERMISSIONS.FIRST_ACCESS_ISSUE)).toBe(role === UserRole.ADMINISTRATOR);
    expect(hasAllPermissions(getRolePermissions(role), both)).toBe(role === UserRole.ADMINISTRATOR);
    expect(hasPermission(role, PERMISSIONS.DATA_IMPORT_EXECUTE)).toBe(role === UserRole.ADMINISTRATOR);
  });
  it.each(['UNKNOWN', '__proto__', 'constructor'])('el rol desconocido %s no concede acceso', role => {
    expect(getRolePermissions(role)).toEqual([]);
    expect(hasPermission(role, PERMISSIONS.FIRST_ACCESS_ISSUE)).toBe(false);
  });
  it('no concede capabilities desconocidas ni utiliza ANY o listas vacías', () => {
    expect(Object.values(PERMISSIONS).sort()).toEqual([...allPermissions].sort());
    const granted = getRolePermissions(UserRole.ADMINISTRATOR);
    expect(hasAllPermissions(granted, [both[0], 'unassigned'])).toBe(false);
    expect(hasPermission(UserRole.ADMINISTRATOR, '*')).toBe(false);
    expect(hasAllPermissions(granted, [])).toBe(false);
    expect(hasAllPermissions(granted, new Array<string>(1))).toBe(false);
    expect(hasAllPermissions(granted, [both[1]])).toBe(true);
    expect(hasAllPermissions([both[0]], both)).toBe(false);
  });
  it('la identidad HTTP recibe una copia y no puede modificar el mapa', () => {
    const user = { id: 'fixture', givenNames: 'Ana', familyNames: 'Prueba', username: 'ana.prueba',
      email: 'fixture@example.test', role: UserRole.ADMINISTRATOR } as UserIdentity;
    const identity = publicIdentity(user);
    expect(identity.permissions).toEqual(allPermissions);
    identity.permissions.length = 0;
    expect(publicIdentity(user).permissions).toEqual(allPermissions);
    expect(Object.isFrozen(getRolePermissions(user.role))).toBe(true);
  });
});

describe('RequirePermissions y PermissionsGuard', () => {
  class Restricted {
    @RequirePermissions(PERMISSIONS.FIRST_ACCESS_ISSUE) one(this: void) {}
    @RequirePermissions(PERMISSIONS.FIRST_ACCESS_ISSUE, PERMISSIONS.PASSWORD_RESET_ISSUE) all(this: void) {}
  }
  const guard = new PermissionsGuard(reflector);
  function context(handler: object, role?: string, permissions: string[] = []): ExecutionContext {
    return { getHandler: () => handler, switchToHttp: () => ({ getRequest: () => ({
      authenticatedUser: role === undefined ? undefined : { role, permissions },
    }) }) } as ExecutionContext;
  }
  it('compone autenticación antes de autorización y conserva los requisitos ALL', () => {
    expect(reflector.get(GUARDS_METADATA, Restricted.prototype.all)).toEqual([SessionGuard, PermissionsGuard]);
    expect(reflector.get(REQUIRED_PERMISSIONS_KEY, Restricted.prototype.all)).toEqual(both);
    expect(reflector.get(REQUIRED_PERMISSIONS_KEY, Restricted.prototype.one)).toEqual([both[0]]);
  });
  it.each([{ values: [] }, { values: ['unknown'] }])('rechaza requisitos inválidos al decorar: $values', ({ values }) => {
    expect(() => RequirePermissions(...values as [Permission, ...Permission[]])).toThrow();
  });
  it('permite uno o varios requisitos desde el rol, sin confiar en permissions adjuntas', () => {
    expect(guard.canActivate(context(Restricted.prototype.one, UserRole.ADMINISTRATOR))).toBe(true);
    expect(guard.canActivate(context(Restricted.prototype.all, UserRole.ADMINISTRATOR))).toBe(true);
    expect(() => guard.canActivate(context(Restricted.prototype.all, UserRole.BOARD, both))).toThrow(ForbiddenException);
  });
  it.each([UserRole.BOARD, UserRole.RESEARCH, UserRole.PLANNING, 'UNKNOWN'])('%s recibe 403', role => {
    expect(() => guard.canActivate(context(Restricted.prototype.one, role))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context(Restricted.prototype.all, role))).toThrow(ForbiddenException);
  });
  it.each([undefined, [], 'auth.first_access.issue', [both[0], 'unknown'], [null], new Array(1)].map(metadata => ({ metadata })))(
    'metadata inválida $metadata falla con error interno controlado', ({ metadata }) => {
      const handler = () => undefined;
      if (metadata !== undefined) Reflect.defineMetadata(REQUIRED_PERMISSIONS_KEY, metadata, handler);
      expect(() => guard.canActivate(context(handler, UserRole.ADMINISTRATOR))).toThrow(InternalServerErrorException);
    });
  it('sin identidad previa informa error de configuración, no decide autenticación', () => {
    expect(() => guard.canActivate(context(Restricted.prototype.one))).toThrow(InternalServerErrorException);
  });
});

describe('Inventario focal de endpoints existentes', () => {
  it.each([
    ['issueFirstAccess', PERMISSIONS.FIRST_ACCESS_ISSUE], ['issuePasswordReset', PERMISSIONS.PASSWORD_RESET_ISSUE],
  ] as const)('%s utiliza su capability con guards en orden', (method, permission) => {
    expect(reflector.get(REQUIRED_PERMISSIONS_KEY, methodHandler(AuthController.prototype, method))).toEqual([permission]);
    expect(reflector.get(GUARDS_METADATA, methodHandler(AuthController.prototype, method))).toEqual([SessionGuard, PermissionsGuard]);
  });
  it('me permanece autenticado sin requerir capability', () => {
    expect(reflector.get(GUARDS_METADATA, methodHandler(AuthController.prototype, 'me'))).toEqual([SessionGuard]);
    expect(reflector.get(REQUIRED_PERMISSIONS_KEY, methodHandler(AuthController.prototype, 'me'))).toBeUndefined();
    expect(reflector.get(GUARDS_METADATA, AuthController)).toBeUndefined();
  });
  it.each(['login', 'logout', 'consumeFirstAccess', 'consumePasswordReset'] as const)('%s conserva acceso público', method => {
    expect(reflector.get(GUARDS_METADATA, methodHandler(AuthController.prototype, method))).toBeUndefined();
    expect(reflector.get(REQUIRED_PERMISSIONS_KEY, methodHandler(AuthController.prototype, method))).toBeUndefined();
  });
  it('health conserva acceso público', () => {
    expect(reflector.get(GUARDS_METADATA, HealthController)).toBeUndefined();
    expect(reflector.get(GUARDS_METADATA, methodHandler(HealthController.prototype, 'getHealth'))).toBeUndefined();
  });
});
