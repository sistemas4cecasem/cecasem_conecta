import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../../config/environment';
import type { PrismaService } from '../../database/prisma.service';
import type { InactivitySourcesService } from '../relationships/inactivity-sources.service';
import type { UsersService } from '../users/users.service';
import type { ReminderSettingsService } from '../settings/reminder-settings.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { ReminderScheduler } from './reminder-scheduler';
import { REMINDER_POLL_MS } from './reminder.rules';

describe('Scheduler horario recuperable de recordatorios',()=>{
  const result={scanned:0,detected:0,failed:0};
  function scheduler(environment:AppEnvironment['NODE_ENV']='production'){
    return new ReminderScheduler({} as PrismaService,{} as InactivitySourcesService,{} as UsersService,{} as ReminderSettingsService,
      {} as NotificationsService,new ConfigService<AppEnvironment,true>({NODE_ENV:environment}));
  }
  beforeEach(()=>jest.useFakeTimers());
  afterEach(()=>{jest.useRealTimers();jest.restoreAllMocks();});
  it('fallo inicial no bloquea startup y reintenta en una hora sin filtrar contenido',async()=>{
    const service=scheduler(),log=jest.spyOn(Logger.prototype,'error').mockImplementation(()=>undefined);
    const sweep=jest.spyOn(service,'sweep').mockRejectedValueOnce(new Error('contenido privado')).mockResolvedValue(result);
    expect(service.onModuleInit()).toBeUndefined();await jest.advanceTimersByTimeAsync(0);expect(sweep).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(REMINDER_POLL_MS-1);expect(sweep).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);expect(sweep).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith('No se pudo completar el barrido de recordatorios; se reintentará.');
    expect(JSON.stringify(log.mock.calls)).not.toContain('contenido privado');await service.onModuleDestroy();
  });
  it('no solapa barridos y espera al trabajo actual en shutdown',async()=>{
    const service=scheduler();let release!:()=>void;
    const sweep=jest.spyOn(service,'sweep').mockImplementation(()=>new Promise(resolve=>{release=()=>resolve(result);}));
    service.onModuleInit();await jest.advanceTimersByTimeAsync(0);await jest.advanceTimersByTimeAsync(2*REMINDER_POLL_MS);
    expect(sweep).toHaveBeenCalledTimes(1);const shutdown=service.onModuleDestroy();release();await shutdown;
    await jest.advanceTimersByTimeAsync(REMINDER_POLL_MS);expect(sweep).toHaveBeenCalledTimes(1);
  });
  it('entorno test mantiene el reloj automático desactivado',async()=>{
    const service=scheduler('test'),sweep=jest.spyOn(service,'sweep').mockResolvedValue(result);
    service.onModuleInit();await jest.advanceTimersByTimeAsync(2*REMINDER_POLL_MS);expect(sweep).not.toHaveBeenCalled();await service.onModuleDestroy();
  });
});
