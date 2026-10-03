import { createHash } from 'node:crypto';
import { DirectoryError } from './directory.errors';

export type DuplicateKind = 'organization' | 'person';
export interface SimilarityActor {
  id: string; version: number; duplicateOfId: string | null;
  name?: string; alias?: string | null; country?: string | null; parentId?: string | null;
  displayName?: string; givenNames?: string | null; familyNames?: string | null;
}
// Umbrales iniciales calibrados en duplicates.rules.spec.ts. No deciden identidad.
export const SIMILARITY_THRESHOLDS = { organization: 0.62, person: 0.65 } as const;
export function comparisonText(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' ');
}
function trigrams(value: string): Set<string> {
  return new Set(value.split(' ').filter(Boolean).flatMap(word => {
    const padded = '  ' + word + ' ';
    return Array.from({ length: padded.length - 2 }, (_, index) => padded.slice(index, index + 3));
  }));
}
export function trigramScore(left: string, right: string): number {
  const a = trigrams(comparisonText(left)), b = trigrams(comparisonText(right));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(token => b.has(token)).length;
  return 2 * intersection / (a.size + b.size);
}
function abbreviatedName(left: string, right: string): boolean {
  const a = comparisonText(left).split(' '), b = comparisonText(right).split(' ');
  if (a.length < 3 || a.length !== b.length || a[0] !== b[0] || a.at(-1) !== b.at(-1)) return false;
  return a.every((word, i) => word === b[i] || (Math.min(word.length, b[i].length) === 1 && word[0] === b[i][0]));
}
export function similarity(kind: DuplicateKind, a: SimilarityActor, b: SimilarityActor) {
  const names = (row: SimilarityActor) => kind === 'organization' ? [row.name ?? '', row.alias ?? '']
    : [row.displayName ?? '', [row.givenNames, row.familyNames].filter(Boolean).join(' ')];
  let score = 0, abbreviation = false;
  for (const left of names(a).filter(Boolean)) for (const right of names(b).filter(Boolean)) {
    score = Math.max(score, trigramScore(left, right));
    if (kind === 'person' && abbreviatedName(left, right)) { score = Math.max(score, 0.82); abbreviation = true; }
  }
  const signals = [kind === 'organization' ? 'SIMILAR_ORGANIZATION_NAMES' : 'SIMILAR_PERSON_NAMES'];
  if (abbreviation) signals.push('COMPATIBLE_INITIALS');
  if (kind === 'organization' && a.country && b.country && comparisonText(a.country) !== comparisonText(b.country)) signals.push('DIFFERENT_COUNTRIES');
  if (kind === 'organization' && (a.parentId || b.parentId)) signals.push('REVIEW_PARENT_OFFICE_CONTEXT');
  return { score: Math.round(score * 10000) / 10000, signals, matches: score >= SIMILARITY_THRESHOLDS[kind] };
}
export function identityFingerprint(kind: DuplicateKind, actor: SimilarityActor): string {
  const values = kind === 'organization' ? [actor.name, actor.alias, actor.country, actor.parentId]
    : [actor.displayName, actor.givenNames, actor.familyNames];
  return createHash('sha256').update(JSON.stringify(values.map(comparisonText))).digest('hex');
}
export function canonicalPair<T extends { id: string }>(a: T, b: T): [T, T] {
  if (a.id === b.id) throw new DirectoryError('INVALID_CONSOLIDATION_TARGET');
  return a.id < b.id ? [a, b] : [b, a];
}
export function requireUnconsolidated(actor: SimilarityActor, kind: DuplicateKind): void {
  if (actor.duplicateOfId) throw new DirectoryError('ACTOR_ALREADY_CONSOLIDATED', {
    principalId: actor.duplicateOfId, principalPath: (kind === 'person' ? 'people/' : 'organizations/') + actor.duplicateOfId,
  });
}
