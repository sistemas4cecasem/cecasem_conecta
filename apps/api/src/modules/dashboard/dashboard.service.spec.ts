import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../database/prisma.service';
import type { UsersService } from '../users/users.service';
import type { VerificationSettingsService } from '../settings/verification-settings.service';
import { DashboardService } from './dashboard.service';

function fixture(role: string, isActive = true) {
  const actor = { id: 'actor', role, isActive };
  const prisma = {
    relationshipProcess: { count: jest.fn().mockImplementation((args: { where: { state?: string | { not: string } } }) => Promise.resolve(args.where.state === 'WAITING_RESPONSE' ? 2 : 3)), findMany: jest.fn().mockResolvedValue([]) },
    opportunity: { groupBy: jest.fn().mockResolvedValue([{ status: 'PENDING_REVIEW', _count: { _all: 2 } }, { status: 'SUBMITTED', _count: { _all: 1 } }]),
      count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    meeting: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    contactIntent: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    notification: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([{ reviewDue: 2n, neverVerified: 1n }]),
  };
  Object.assign(prisma, { $transaction: jest.fn((work: (tx: typeof prisma) => Promise<unknown>) => work(prisma)) });
  const users = { findIdentityById: jest.fn().mockResolvedValue(actor) };
  const settings = { get: jest.fn().mockResolvedValue({ institutionalVerificationMonths: 12 }) };
  const clock = { now: jest.fn().mockReturnValue(new Date('2026-10-05T12:00:00Z')) };
  return { service: new DashboardService(prisma as unknown as PrismaService, users as unknown as UsersService,
    settings as unknown as VerificationSettingsService, clock), prisma, users };
}

describe('DashboardService', () => {
  it.each([['ADMINISTRATOR', 'institutional'], ['BOARD', 'institutional'], ['RESEARCH', 'research'], ['PLANNING', 'planning']] as const)('genera la proyección %s a partir del rol de sesión', async (role, view) => {
      const { service } = fixture(role);
      expect((await service.get('actor')).view).toBe(view);
    });

  it('reutiliza estados de dominio, expresa postulaciones y verificación sin snapshots', async () => {
    const { service, prisma } = fixture('BOARD');
    const result = await service.get('actor');
    expect(result).toMatchObject({ view: 'institutional', activeProcesses: 3, waitingResponseProcesses: 2,
      opportunities: { pendingReview: 2, submitted: 1, preparing: 0 }, pendingApplications: 0,
      organizationsReviewDue: 2, organizationsNeverVerified: 1 });
    expect(prisma.relationshipProcess.count).toHaveBeenCalledWith({ where: { state: { not: 'CLOSED' } } });
    expect(prisma.opportunity.count).toHaveBeenCalledWith({ where: { status: 'SUBMITTED' } });
    expect(prisma.meeting.findMany).toHaveBeenCalledTimes(1);
  });

  it('acota procesos e intenciones de Búsqueda a autoría y participación formal, y usa recordatorios no leídos persistidos', async () => {
    const { service, prisma } = fixture('RESEARCH');
    await service.get('actor');
    expect(prisma.relationshipProcess.count).toHaveBeenCalledWith({ where: { OR: [{ createdByUserId: 'actor' }, { participants: { some: { userId: 'actor' } } }], state: { not: 'CLOSED' } } });
    expect(prisma.contactIntent.count).toHaveBeenCalledWith({ where: { authorUserId: 'actor', state: 'ACTIVE' } });
    expect(prisma.notification.count).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rechaza usuario desactivado antes de consultar proyecciones', async () => {
    const { service, prisma, users } = fixture('RESEARCH', false);
    await expect(service.get('actor')).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.findIdentityById).toHaveBeenCalledWith('actor', expect.any(Object));
    expect(prisma.relationshipProcess.count).not.toHaveBeenCalled();
  });
});
