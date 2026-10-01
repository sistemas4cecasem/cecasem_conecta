import { BadRequestException } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { createValidationPipe } from './application';

// Test-only DTO; no artificial HTTP endpoint is added to the application.
class ExampleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

describe('Global validation policy', () => {
  const metadata = { type: 'body' as const, metatype: ExampleDto };

  it('transforms a valid payload into its DTO', async () => {
    const validated: unknown = await createValidationPipe().transform(
      { name: 'CECASEM' },
      metadata,
    );
    expect(validated).toBeInstanceOf(ExampleDto);
    expect(validated).toEqual({ name: 'CECASEM' });
  });

  it('rejects unexpected properties', async () => {
    await expect(
      createValidationPipe().transform({ name: 'CECASEM', extra: true }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid field values', async () => {
    await expect(
      createValidationPipe().transform({ name: 42 }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
