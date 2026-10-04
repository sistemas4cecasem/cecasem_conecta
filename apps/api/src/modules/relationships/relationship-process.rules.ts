import { ProcessState, ProcessResult, ProcessAuthority, UserRole } from '../../generated/prisma/client';
import type { InstitutionalTarget } from '../directory/directory-target.service';

export type ProcessErrorCode = 'FORBIDDEN' | 'INVALID_PROCESS' | 'PROCESS_NOT_FOUND' | 'PROCESS_TARGET_UNAVAILABLE' |
  'VERSION_CONFLICT' | 'INVALID_TRANSITION' | 'PROCESS_ALREADY_CLOSED' | 'PROCESS_NOT_CLOSED';
export class ProcessError extends Error {
  constructor(public readonly code: ProcessErrorCode) { super(code); }
}

export const OPEN_PROCESS_STATES = [ProcessState.PREPARATION, ProcessState.IN_PROGRESS, ProcessState.WAITING_RESPONSE, ProcessState.NEGOTIATION] as const;
// Preparación permite iniciar trabajo o esperar respuesta; negociación requiere trabajo iniciado.
// Los retornos operativos permiten continuar/revisar sin volver a preparar el objetivo desde cero.
export const PROCESS_TRANSITIONS: Readonly<Record<ProcessState, readonly ProcessState[]>> = {
  PREPARATION: [ProcessState.IN_PROGRESS, ProcessState.WAITING_RESPONSE],
  IN_PROGRESS: [ProcessState.PREPARATION, ProcessState.WAITING_RESPONSE, ProcessState.NEGOTIATION],
  WAITING_RESPONSE: [ProcessState.IN_PROGRESS, ProcessState.NEGOTIATION],
  NEGOTIATION: [ProcessState.IN_PROGRESS, ProcessState.WAITING_RESPONSE],
  CLOSED: [],
};
export function processPurpose(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 5000) throw new ProcessError('INVALID_PROCESS');
  return value.trim();
}
export function processTarget(input: { organizationId?: string; personId?: string }): InstitutionalTarget {
  if (!!input.organizationId === !!input.personId) throw new ProcessError('INVALID_PROCESS');
  return input.organizationId ? { organizationId: input.organizationId } : { personId: input.personId! };
}
export function processObservation(value?: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.trim().length > 5000) throw new ProcessError('INVALID_PROCESS');
  return value.trim() || null;
}
export function processVersion(version: number, expected: number): void {
  if (!Number.isInteger(expected) || expected < 1) throw new ProcessError('INVALID_PROCESS');
  if (version !== expected) throw new ProcessError('VERSION_CONFLICT');
}
export function processTransition(from: ProcessState, to: ProcessState): void {
  if (!PROCESS_TRANSITIONS[from]?.includes(to)) throw new ProcessError('INVALID_TRANSITION');
}
export function processClosure(state: ProcessState, result: ProcessResult, observation?: string) {
  if (state === ProcessState.CLOSED) throw new ProcessError('PROCESS_ALREADY_CLOSED');
  if (!Object.values(ProcessResult).includes(result)) throw new ProcessError('INVALID_PROCESS');
  const note = processObservation(observation);
  if (result === ProcessResult.OTHER && !note) throw new ProcessError('INVALID_PROCESS');
  return { state: ProcessState.CLOSED, currentResult: result, closureObservation: note };
}
export function processReopening(state: ProcessState, to: ProcessState, reason: string) {
  if (state !== ProcessState.CLOSED) throw new ProcessError('PROCESS_NOT_CLOSED');
  const observation = processObservation(reason);
  if (!OPEN_PROCESS_STATES.some(value => value === to) || !observation) throw new ProcessError('INVALID_PROCESS');
  return { state: to, currentResult: null, closureObservation: null, closedAt: null, closedByUserId: null };
}
export function processAuthority(role: UserRole, isParticipant: boolean): ProcessAuthority | null {
  if (role === UserRole.ADMINISTRATOR) return ProcessAuthority.ADMINISTRATOR;
  if (role === UserRole.BOARD) return ProcessAuthority.BOARD;
  if ((role === UserRole.RESEARCH || role === UserRole.PLANNING) && isParticipant) return ProcessAuthority.PARTICIPANT;
  return null;
}
