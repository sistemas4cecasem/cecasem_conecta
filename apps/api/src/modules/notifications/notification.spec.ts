import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { notificationCursor, encodeNotificationCursor } from './notification-cursor';
import { NotificationQueryDto } from './notification.dto';

describe('Contrato de notificaciones propias', () => {
  it('conserva fecha y UUID del cursor compuesto', () => {
    const cursor = { createdAt: new Date('2026-10-04T10:00:00.000Z'), id: '11111111-1111-4111-8111-111111111111' };
    expect(notificationCursor(encodeNotificationCursor(cursor))).toEqual(cursor);
    expect(notificationCursor()).toBeUndefined();
  });
  it.each(['', '!', 'x'.repeat(513), Buffer.from('{}').toString('base64url'),
    Buffer.from(JSON.stringify({ id: 'otra', createdAt: '2026-10-04T10:00:00.000Z' })).toString('base64url'),
    Buffer.from(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', createdAt: 'fecha' })).toString('base64url')])('rechaza cursor no válido %s', value => { expect(() => notificationCursor(value)).toThrow(); });
  it.each([{ pageSize: '0' }, { pageSize: '101' }, { pageSize: '1.5' }, { pageSize: 'no' }, { status: 'otro' }, { after: 'x'.repeat(513) }])('rechaza consulta inválida %j', async value => { expect(await validate(plainToInstance(NotificationQueryDto, value))).not.toHaveLength(0); });
  it.each([{ pageSize: '1', status: 'unread' }, { pageSize: '100', status: 'read' }, { status: 'all' }, {}])('admite consulta acotada %j', async value => { expect(await validate(plainToInstance(NotificationQueryDto, value))).toHaveLength(0); });
});
