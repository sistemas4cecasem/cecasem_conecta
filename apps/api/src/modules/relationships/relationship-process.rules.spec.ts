import { ProcessState, ProcessResult, ProcessAuthority, UserRole } from '../../generated/prisma/client';
import { processAuthority, processClosure, processObservation, processPurpose, processReopening, processTarget, processTransition, processVersion } from './relationship-process.rules';
const validTransitions = new Set(['PREPARATION:IN_PROGRESS', 'PREPARATION:WAITING_RESPONSE',
  'IN_PROGRESS:PREPARATION', 'IN_PROGRESS:WAITING_RESPONSE', 'IN_PROGRESS:NEGOTIATION',
  'WAITING_RESPONSE:IN_PROGRESS', 'WAITING_RESPONSE:NEGOTIATION', 'NEGOTIATION:IN_PROGRESS', 'NEGOTIATION:WAITING_RESPONSE']);
describe('Reglas de procesos', () => {
  it('normaliza propósito sin fabricar objetivos', () => {
    expect(processPurpose(' Cooperación ')).toBe('Cooperación'); expect(processTarget({ organizationId: 'org' })).toEqual({ organizationId: 'org' });
    expect(processTarget({ personId: 'person' })).toEqual({ personId: 'person' });
  });
  it.each(['', ' \n\t ', 'x'.repeat(5001)])('rechaza propósito inválido', value => { expect(() => processPurpose(value)).toThrow('INVALID_PROCESS'); });
  it.each([{}, { organizationId: 'org', personId: 'person' }])('exige un actor %j', value => { expect(() => processTarget(value)).toThrow('INVALID_PROCESS'); });
  it.each(Object.values(ProcessState).flatMap(from => Object.values(ProcessState).map(to => ({ from, to, valid: validTransitions.has(from + ':' + to) }))))('$from → $to: $valid', ({ from, to, valid }) => {
    if (valid) expect(() => processTransition(from, to)).not.toThrow(); else expect(() => processTransition(from, to)).toThrow('INVALID_TRANSITION');
  });
  it.each(Object.values(ProcessResult))('cierra con resultado %s', result => {
    expect(processClosure(ProcessState.PREPARATION, result, 'Razón')).toEqual({ state: 'CLOSED', currentResult: result, closureObservation: 'Razón' });
  });
  it.each([undefined, '', ' \n '])('Otro exige observación %j', value => { expect(() => processClosure(ProcessState.IN_PROGRESS, ProcessResult.OTHER, value)).toThrow('INVALID_PROCESS'); });
  it('rechaza cierre repetido y resultado ausente', () => {
    expect(() => processClosure(ProcessState.CLOSED, ProcessResult.ACHIEVED)).toThrow('PROCESS_ALREADY_CLOSED');
    expect(() => processClosure(ProcessState.PREPARATION, undefined as never)).toThrow('INVALID_PROCESS');
  });
  it.each(Object.values(ProcessState).filter(state => state !== 'CLOSED'))('reabre explícitamente hacia %s limpiando solo proyección vigente', to => {
    expect(processReopening(ProcessState.CLOSED, to, 'Respuesta tardía')).toEqual({ state: to, currentResult: null, closureObservation: null, closedAt: null, closedByUserId: null });
  });
  it('rechaza reapertura abierta, destino cerrado y motivo vacío', () => {
    expect(() => processReopening(ProcessState.PREPARATION, ProcessState.IN_PROGRESS, 'Razón')).toThrow('PROCESS_NOT_CLOSED');
    expect(() => processReopening(ProcessState.CLOSED, ProcessState.CLOSED, 'Razón')).toThrow('INVALID_PROCESS');
    expect(() => processReopening(ProcessState.CLOSED, ProcessState.IN_PROGRESS, ' \n ')).toThrow('INVALID_PROCESS');
  });
  it.each(Object.values(UserRole))('%s participante puede actuar', role => { expect(processAuthority(role, true)).not.toBeNull(); });
  it.each([UserRole.RESEARCH, UserRole.PLANNING])('%s sin participación no obtiene facultades', role => { expect(processAuthority(role, false)).toBeNull(); });
  it('auditoría identifica Administración y Directorio aun siendo participantes', () => {
    expect(processAuthority(UserRole.ADMINISTRATOR, false)).toBe(ProcessAuthority.ADMINISTRATOR);
    expect(processAuthority(UserRole.BOARD, false)).toBe(ProcessAuthority.BOARD);
    expect(processAuthority(UserRole.RESEARCH, true)).toBe(ProcessAuthority.PARTICIPANT);
    expect(processAuthority('UNKNOWN' as never, true)).toBeNull();
  });
  it('normaliza observación y protege versión', () => {
    expect(processObservation(' Texto ')).toBe('Texto'); expect(processObservation(' ')).toBeNull();
    expect(() => processObservation('x'.repeat(5001))).toThrow('INVALID_PROCESS');
    expect(() => processVersion(2, 1)).toThrow('VERSION_CONFLICT'); expect(() => processVersion(1, 0)).toThrow('INVALID_PROCESS'); expect(() => processVersion(1, 1)).not.toThrow();
  });
});
