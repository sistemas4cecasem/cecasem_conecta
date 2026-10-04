import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../../config/environment';
import type { PrismaService } from '../../database/prisma.service';
import type { OpportunitiesService } from '../opportunities/opportunities.service';
import type { UsersService } from '../users/users.service';
import { NotificationConsumer } from './notification-consumer';

describe('Ejecución automática recuperable', () => {
  const result = { scanned: 0, delivered: 0, failed: 0, busy: false };
  function consumer(environment: AppEnvironment['NODE_ENV'] = 'production') {
    return new NotificationConsumer({} as PrismaService, {} as OpportunitiesService, {} as UsersService,
      new ConfigService<AppEnvironment, true>({ NODE_ENV: environment }));
  }
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('error inicial no bloquea startup y se reintenta sin revelar su contenido', async () => {
    const service = consumer(), log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const process = jest.spyOn(service, 'consumeBatch').mockRejectedValueOnce(new Error('contenido privado')).mockResolvedValue(result);
    expect(service.onModuleInit()).toBeUndefined();
    await jest.advanceTimersByTimeAsync(0); expect(process).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(5000); expect(process).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith('No se pudo procesar el lote de notificaciones; se reintentará.');
    expect(JSON.stringify(log.mock.calls)).not.toContain('contenido privado'); await service.onModuleDestroy();
  });
  it('no solapa trabajos y espera al lote en curso antes de detenerse', async () => {
    const service = consumer(); let release!: () => void;
    const process = jest.spyOn(service, 'consumeBatch').mockImplementation(() => new Promise(resolve => { release = () => resolve(result); }));
    service.onModuleInit(); await jest.advanceTimersByTimeAsync(0); await jest.advanceTimersByTimeAsync(30000);
    expect(process).toHaveBeenCalledTimes(1);
    const shutdown = service.onModuleDestroy(); release(); await shutdown; await jest.advanceTimersByTimeAsync(30000);
    expect(process).toHaveBeenCalledTimes(1);
  });
  it('permite controlar los lotes en pruebas sin timer automático', async () => {
    const service = consumer('test'), process = jest.spyOn(service, 'consumeBatch').mockResolvedValue(result);
    service.onModuleInit(); await jest.advanceTimersByTimeAsync(10000); expect(process).not.toHaveBeenCalled(); await service.onModuleDestroy();
  });
});
