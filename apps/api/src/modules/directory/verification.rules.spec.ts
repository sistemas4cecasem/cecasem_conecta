import { addCalendarMonths, verificationCondition, verificationTargets } from './verification.rules';
describe('Verificación y meses calendario UTC', () => {
  it.each([
    ['2025-01-31T10:20:30.123Z', 1, '2025-02-28T10:20:30.123Z'],
    ['2024-01-31T10:20:30.123Z', 1, '2024-02-29T10:20:30.123Z'],
    ['2024-02-29T10:20:30.123Z', 12, '2025-02-28T10:20:30.123Z'],
    ['2025-12-31T10:20:30.123Z', 2, '2026-02-28T10:20:30.123Z'],
    ['2026-08-31T10:20:30.123Z', 6, '2027-02-28T10:20:30.123Z'],
    ['2026-03-15T10:20:30.123Z', 12, '2027-03-15T10:20:30.123Z'],
  ])('%s más %s meses limita el día al último del mes', (at, months, expected) => {
    const original = new Date(at); expect(addCalendarMonths(original, months).toISOString()).toBe(expected); expect(original.toISOString()).toBe(at);
  });
  const current = { version: 2, contactValueVersion: null }, latest = { verifiedAt: new Date('2026-01-31T12:00:00Z'), objectVersion: 2, contactValueVersion: null };
  it.each([[-1, 'CURRENT'], [0, 'REVIEW_DUE'], [1, 'REVIEW_DUE']])('la frontera now>=dueAt es explícita (%s ms)', (offset, expected) => {
    expect(verificationCondition(latest, current, 6, new Date(+new Date('2026-07-31T12:00:00Z') + offset)).verificationStatus).toBe(expected);
  });
  it('nunca verificado no hereda creación, modificación ni un vencimiento', () => {
    expect(verificationCondition(null, current, 6, new Date())).toEqual({ verificationStatus: 'NEVER_VERIFIED', nextReviewAt: null, changedSinceVerification: false, timeReviewDue: false });
  });
  it('una modificación posterior requiere revisión aunque el reloj esté en el mismo milisegundo', () => {
    expect(verificationCondition(latest, { ...current, version: 3 }, 6, latest.verifiedAt)).toMatchObject({ verificationStatus: 'REVIEW_DUE', changedSinceVerification: true, timeReviewDue: false });
  });
  it('una corrección del valor del canal invalida su corroboración contextual', () => {
    expect(verificationCondition({ ...latest, contactValueVersion: 1 }, { ...current, contactValueVersion: 2 }, 6, latest.verifiedAt).changedSinceVerification).toBe(true);
  });
  it('cambiar el intervalo recalcula sin cambiar el evento', () => {
    const now = new Date('2026-06-30T12:00:00Z'); const before = { ...latest };
    expect(verificationCondition(latest, current, 6, now).verificationStatus).toBe('CURRENT');
    expect(verificationCondition(latest, current, 4, now).verificationStatus).toBe('REVIEW_DUE'); expect(latest).toEqual(before);
  });
  it.each(Object.entries(verificationTargets))('%s tiene clasificación explícita y objetivo con FK', (kind, target) => {
    expect(target.classification).toBe(['organization','organizationContact','importedHistory'].includes(kind) ? 'institutional' : 'personal'); expect(target.column.endsWith('Id')).toBe(true);
  });
});
