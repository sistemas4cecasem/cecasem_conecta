import { Test } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, UserRole } from '../../generated/prisma/client';
import { InvalidIdentityError } from './identity.errors';
import { UsersService } from './users.service';
import { USERNAME_MAX_ATTEMPTS } from './username';
import { userIdentitySelect } from './user-projections';

function collision(target: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint', {
    code: 'P2002', clientVersion: '7.10.0', meta: { target: [target] },
  });
}

describe('User identity persistence rules', () => {
  const input = { givenNames: 'Diego Armando', familyNames: 'Fariñas Ávila', email: ' Diego@CECASEM.com ', role: UserRole.RESEARCH };
  const create = jest.fn();
  let service: UsersService;

  beforeEach(async () => {
    create.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: { user: { create } } }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('retries only username collisions and persists the normalized email', async () => {
    create.mockRejectedValueOnce(collision('username')).mockRejectedValueOnce(collision('username'))
      .mockResolvedValueOnce({ username: 'diego.farinas3' });
    await expect(service.createIdentity(input)).resolves.toMatchObject({ username: 'diego.farinas3' });
    expect(create.mock.calls.map((call: unknown[]) => call[0])).toEqual([1, 2, 3].map((attempt) => ({
      select: userIdentitySelect,
      data: { givenNames: input.givenNames, familyNames: input.familyNames, email: 'diego@cecasem.com',
        role: UserRole.RESEARCH, username: `diego.farinas${attempt === 1 ? '' : attempt}` },
    })));
  });

  it('stops after the bounded number of collisions', async () => {
    create.mockRejectedValue(collision('username'));
    await expect(service.createIdentity(input)).rejects.toMatchObject({ code: 'USERNAME_EXHAUSTED' });
    expect(create).toHaveBeenCalledTimes(USERNAME_MAX_ATTEMPTS);
  });

  it('recognizes the structured adapter-pg constraint without inspecting messages', async () => {
    const failure = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002', clientVersion: '7.10.0', meta: { driverAdapterError: { cause: { constraint: { index: 'User_username_key' } } } },
    });
    create.mockRejectedValueOnce(failure).mockResolvedValueOnce({ username: 'diego.farinas2' });
    await expect(service.createIdentity(input)).resolves.toMatchObject({ username: 'diego.farinas2' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('does not retry an email conflict', async () => {
    create.mockRejectedValue(collision('email'));
    await expect(service.createIdentity(input)).rejects.toMatchObject({ code: 'EMAIL_EXISTS' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('propagates unexpected database failures', async () => {
    const failure = new Error('Database unavailable');
    create.mockRejectedValue(failure);
    await expect(service.createIdentity(input)).rejects.toBe(failure);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not retry unique violations for unknown targets', async () => {
    const failure = collision('id');
    create.mockRejectedValue(failure);
    await expect(service.createIdentity(input)).rejects.toBe(failure);
  });

  it('rejects an absent role instead of granting a default', async () => {
    await expect(service.createIdentity({ ...input, role: undefined as unknown as UserRole })).rejects.toBeInstanceOf(InvalidIdentityError);
    expect(create).not.toHaveBeenCalled();
  });
});
