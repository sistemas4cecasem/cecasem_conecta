import { randomUUID } from 'node:crypto';
import { ContactType } from '../../generated/prisma/client';
import { referralFields, referralFingerprint } from './referral.rules';
describe('Recomendaciones históricas sin datos fabricados', () => {
  it.each([{ recommendedName: 'Juan del área de proyectos' }, { organizationNameSnapshot: 'Su organización aliada en Perú' }, { personId: randomUUID() }, { organizationId: randomUUID() }, { mediumType: ContactType.EMAIL, mediumValue: 'Maria@Example.org' }])('acepta información parcial significativa: %j', input => {
    const row = referralFields(input); expect(row.notes).toBeNull(); expect(row.contactMethodId).toBeNull();
  });
  it.each([{}, { notes: 'Solo observación' }, { recommendedRole: 'Director' }, { recommendedName: '   ' }, { notes: '   ', recommendedName: 'Juan' }, { mediumType: ContactType.EMAIL }, { mediumValue: 'a@example.org' }, { mediumType: ContactType.EMAIL, mediumValue: 'inválido' }, { mediumType: ContactType.PHONE, mediumValue: '123' }, { mediumType: ContactType.WEB, mediumValue: 'javascript:alert(1)' }, { mediumType: ContactType.LINKEDIN, mediumValue: 'https://example.org' }, { personId: 'inexistente' }, { contactMethodId: randomUUID(), recommendedName: 'Juan' }, { recommendedName: 'a'.repeat(301) }, { recommendedName: 'Juan\0' }])('rechaza vacío o medio/referencia incoherente: %j', input => {
    expect(() => referralFields(input)).toThrow('INVALID_REFERRAL');
  });
  it('recorta extremos sin sustituir capitalización, espacios internos ni snapshots', () => {
    expect(referralFields({ recommendedName: '  Dra. María  Pérez  ', mediumType: 'EMAIL', mediumValue: ' Maria@Example.org ' })).toMatchObject({ recommendedName: 'Dra. María  Pérez', mediumValue: 'Maria@Example.org', personId: null, organizationId: null });
  });
  it('fingerprint estable para null/omitidos y trim, pero distingue origen y texto histórico', () => {
    const source = randomUUID(), key = randomUUID(), row = referralFields({ recommendedName: 'Juan' });
    const fingerprint = referralFingerprint(source, row, key);
    expect(referralFingerprint(source, referralFields({ recommendedName: ' Juan ', notes: null }), key)).toBe(fingerprint);
    expect(referralFingerprint(randomUUID(), row, key)).not.toBe(fingerprint);
    expect(referralFingerprint(source, referralFields({ recommendedName: 'JUAN' }), key)).not.toBe(fingerprint);
  });
  it('la key debe ser UUID', () => expect(() => referralFingerprint(randomUUID(), referralFields({ recommendedName: 'Juan' }), '')).toThrow('INVALID_REFERRAL'));
  it.each(Object.values(ContactType))('acepta el tipo canónico %s', type => {
    const values = { EMAIL: 'a@example.org', PHONE: '+591 76543210', LINKEDIN: 'https://linkedin.com/in/maria', FORM: 'https://example.org/form', WEB: 'https://example.org', OTHER: 'Mesa de proyectos' };
    expect(referralFields({ mediumType: type, mediumValue: values[type] }).mediumType).toBe(type);
  });
});
