import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { HealthService } from './health.service';

describe('Health service', () => {
  it('converts a database failure into a controlled unavailable response', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [HealthService, {
        provide: PrismaService,
        useValue: { $queryRaw: jest.fn().mockRejectedValue(new Error('Private connection details')) },
      }],
    }).compile();
    try {
      await expect(moduleRef.get(HealthService).check()).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(moduleRef.get(HealthService).check()).rejects.not.toThrow('Private connection details');
    } finally {
      await moduleRef.close();
    }
  });
});
