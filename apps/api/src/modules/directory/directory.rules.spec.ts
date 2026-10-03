import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrganizationInputDto, OrganizationEditDto, DirectoryQueryDto, OrganizationQueryDto } from './directory.dto';
import { assertAcyclic, assertVersion, categoryName, institutionalText, website } from './directory.rules';

describe('Reglas del directorio', () => {
  it.each(['', '  ', null, undefined])('rechaza nombre requerido %s', value => {
    expect(() => institutionalText(value, 250, true)).toThrow();
  });
  it('permite información desconocida y normaliza espacios sin inferir país', () => {
    expect(institutionalText('  Estado   Plurinacional  ', 150)).toBe('Estado Plurinacional');
    expect(institutionalText('', 150)).toBeNull(); expect(institutionalText(undefined, 150)).toBeNull();
    expect(() => institutionalText('x'.repeat(151), 150)).toThrow();
  });
  it('normaliza categorías equivalentes sin eliminar acentos ni cambiar identidad', () => {
    expect(categoryName('  Educación   Ambiental  ')).toEqual({ name: 'Educación Ambiental', normalizedName: 'educación ambiental' });
    expect(categoryName('EDUCACIÓN ambiental').normalizedName).toBe(categoryName('Educación Ambiental').normalizedName);
  });
  it.each(['javascript:alert(1)', 'ftp://example.test', 'example.test', 'https://user:pass@example.test'])('rechaza sitio %s', value => {
    expect(() => website(value)).toThrow();
  });
  it('acepta sitio público http(s) y ausencia', () => {
    expect(website(' https://example.test/path ')).toBe('https://example.test/path'); expect(website(null)).toBeNull();
  });
  it('impide autorreferencia y ciclos indirectos', () => {
    expect(() => assertAcyclic('a', ['a'])).toThrow();
    expect(() => assertAcyclic('a', ['b', 'c', 'a'])).toThrow();
    expect(() => assertAcyclic('a', ['b', 'c', 'b'])).toThrow();
    expect(() => assertAcyclic('a', ['b', 'c'])).not.toThrow();
  });
  it('versión inválida se diferencia de conflicto', () => {
    expect(() => assertVersion(2, 1)).toThrow('VERSION_CONFLICT');
    expect(() => assertVersion(2, 0)).toThrow('INVALID_DIRECTORY');
    expect(() => assertVersion(2, 2)).not.toThrow();
  });
  it('DTO permite solo nombre, rechaza categorías duplicadas y verificación impuesta', async () => {
    expect(await validate(plainToInstance(OrganizationInputDto, { name: '  Fundación  ' }))).toHaveLength(0);
    expect(await validate(plainToInstance(OrganizationInputDto, { name: 'Fundación', categoryIds: [null] }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(OrganizationInputDto, { name: 'Fundación', lastVerifiedAt: new Date() }), { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
  });
  it('DTO exige versión para editar y acota paginación', async () => {
    expect(await validate(plainToInstance(OrganizationEditDto, { name: 'Nombre' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(DirectoryQueryDto, { pageSize: 101 }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(DirectoryQueryDto, { page: '2', pageSize: '25' }))).toHaveLength(0);
  });
  it('permite categoría UUID opcional junto con estado y paginación, sin extender el catálogo', async () => {
    const options = { whitelist: true, forbidNonWhitelisted: true };
    expect(await validate(plainToInstance(OrganizationQueryDto, {}), options)).toHaveLength(0);
    const input = { categoryId: '11111111-1111-4111-8111-111111111111', status: 'inactive', page: '2', pageSize: '1' };
    expect(await validate(plainToInstance(OrganizationQueryDto, input), options)).toHaveLength(0);
    expect(await validate(plainToInstance(DirectoryQueryDto, input), options)).not.toHaveLength(0);
  });
  it.each(['', 'no-es-uuid', 'null', null, ['11111111-1111-4111-8111-111111111111']])('rechaza categoryId inválido %j', async categoryId => {
    expect(await validate(plainToInstance(OrganizationQueryDto, { categoryId }), { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
  });
});
