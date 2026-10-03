import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../database/prisma.service';
import type { UsersService } from '../users/users.service';
import type { DirectoryActorPolicy } from './directory-actor.policy';
import { DuplicateDetectionService, candidateContract, type CandidateRow } from './duplicate-detection.service';

const service = new DuplicateDetectionService({} as PrismaService, {} as UsersService, {} as DirectoryActorPolicy);
function candidate(): CandidateRow {
  const a = { id: '11111111-1111-4111-8111-111111111111', name: 'Fundación Esperanza', alias: null, country: null,
    parentId: null, parent: null, version: 1, duplicateOfId: null, isActive: true, lastVerifiedAt: null };
  const b = { ...a, id: '22222222-2222-4222-8222-222222222222' };
  return { id: randomUUID(), organizationAId: a.id, organizationBId: b.id, personAId: null, personBId: null,
    identityA: 'a'.repeat(64), identityB: 'b'.repeat(64), examinedVersionA: 1, examinedVersionB: 1, score: 1, signals: ['SIMILAR_ORGANIZATION_NAMES'],
    version: 1, state: 'PENDING', detectedAt: new Date(), resolvedAt: null, resolvedByUserId: null, principalOrganizationId: null,
    principalPersonId: null, operationId: null, organizationA: a, organizationB: b, personA: null, personB: null, resolvedBy: null };
}
describe('Decisiones sobre versiones explícitas del candidato', () => {
  it('pareja pending con las tres versiones actuales puede revisarse', () => {
    expect(() => service.assertCurrent(candidate(), { expectedVersionA: 1, expectedVersionB: 1, expectedCandidateVersion: 1 })).not.toThrow();
  });
  it.each(['a', 'b'] as const)('cambio de ficha %s vuelve stale la advertencia y rechaza decisión', side => {
    const row = candidate(); (side === 'a' ? row.organizationA! : row.organizationB!).version = 2;
    expect(candidateContract(row).stale).toBe(true); expect(() => service.assertCurrent(row)).toThrow('DUPLICATE_CANDIDATE_STALE');
  });
  it.each(['expectedVersionA', 'expectedVersionB', 'expectedCandidateVersion'] as const)('rechaza %s anterior', field => {
    expect(() => service.assertCurrent(candidate(), { expectedVersionA: 1, expectedVersionB: 1, expectedCandidateVersion: 1, [field]: 2 })).toThrow('CONSOLIDATION_VERSION_CONFLICT');
  });
  it.each(['NOT_DUPLICATE', 'CONSOLIDATED'] as const)('resolución %s no se sobrescribe como otra consolidación', state => {
    expect(() => service.assertCurrent({ ...candidate(), state })).toThrow('INVALID_CONSOLIDATION_TARGET');
  });
  it('actor consolidado redirige al principal y no acepta decidir otra vez', () => {
    const row = candidate(), principalId = randomUUID(); row.organizationB!.duplicateOfId = principalId;
    expect(candidateContract(row).stale).toBe(true);
    try { service.assertCurrent(row); throw new Error('Debe rechazar'); }
    catch (error) { expect(error).toMatchObject({ code: 'ACTOR_ALREADY_CONSOLIDATED', details: { principalId, principalPath: 'organizations/' + principalId } }); }
  });
  it('la proyección pública no incorpora datos de autenticación ni confunde fecha de verificación con identidad', () => {
    const row = candidate(); row.organizationA!.lastVerifiedAt = new Date();
    expect(candidateContract(row)).toMatchObject({ kind: 'organization', stale: false, state: 'PENDING' });
    expect(JSON.stringify(candidateContract(row))).not.toMatch(/password|tokenHash|session|username/);
  });
});
