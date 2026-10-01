import { randomBytes } from 'node:crypto';
import { argon2i, hash } from 'argon2';
import { PasswordService, PASSWORD_OPTIONS, passwordLength, validLoginPassword } from './password.service';

describe('Password policy and Argon2id', () => {
  const service = new PasswordService();
  const password = randomBytes(24).toString('base64url');
  beforeAll(() => service.onModuleInit());

  it('persists PHC with approved parameters and unique salts', async () => {
    const first = await service.hashNew(password);
    const second = await service.hashNew(password);
    expect(first).toMatch(/^\$argon2id\$v=19\$/);
    expect(first.split('$')[3].split(',').sort()).toEqual(['m=65536', 'p=1', 't=3']);
    expect(second).not.toBe(first);
    expect(await service.verify(password, first)).toBe(true);
    expect(await service.verify(`${password}x`, first)).toBe(false);
    expect(service.needsRehash(first)).toBe(false);
  });

  it('normalizes NFC consistently without trimming or collapsing spaces', async () => {
    const value = ` ${password} é `;
    const stored = await service.hashNew(value);
    expect(await service.verify(` ${password} e\u0301 `, stored)).toBe(true);
    expect(await service.verify(value.trim(), stored)).toBe(false);
  });

  it('counts Unicode code points and prepares the new-password policy', async () => {
    expect(passwordLength('😀'.repeat(15))).toBe(15);
    expect(passwordLength('e\u0301'.repeat(15))).toBe(15);
    expect(await service.verify('😀'.repeat(15), await service.hashNew('😀'.repeat(15)))).toBe(true);
    expect(() => service.hashNew('a'.repeat(14))).toThrow();
    expect(() => service.hashNew('😀'.repeat(129))).toThrow();
    expect(await service.verify('a'.repeat(128), await service.hashNew('a'.repeat(128)))).toBe(true);
  });

  it('login permits short input without imposing creation policy, with a bounded maximum', () => {
    expect(validLoginPassword('a')).toBe(true);
    expect(validLoginPassword('😀'.repeat(128))).toBe(true);
    for (const value of ['', 'a'.repeat(129), 12, null]) expect(validLoginPassword(value)).toBe(false);
  });

  it('uses its precomputed reference for absent credentials', async () => {
    expect(await service.verify(password, null)).toBe(false);
  });

  it('detects parameter and variant changes for rehash', async () => {
    expect(service.needsRehash(await hash(password, { ...PASSWORD_OPTIONS, timeCost: 2 }))).toBe(true);
    expect(service.needsRehash(await hash(password, { ...PASSWORD_OPTIONS, type: argon2i }))).toBe(true);
  });
});
