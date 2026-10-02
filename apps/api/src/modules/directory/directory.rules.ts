import { DirectoryError } from './directory.errors';

export function institutionalText(value: string | null | undefined, maximum: number, required = false): string | null {
  if (value == null) {
    if (required) throw new DirectoryError('INVALID_DIRECTORY');
    return null;
  }
  if (typeof value !== 'string') throw new DirectoryError('INVALID_DIRECTORY');
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (normalized.length > maximum || required && !normalized) throw new DirectoryError('INVALID_DIRECTORY');
  return normalized || null;
}
export function categoryName(value: string): { name: string; normalizedName: string } {
  const name = institutionalText(value, 150, true)!;
  return { name, normalizedName: name.toLowerCase() };
}
export function website(value: string | null | undefined): string | null {
  const normalized = institutionalText(value, 2048);
  if (normalized !== null) {
    try {
      const parsed = new URL(normalized);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) throw new Error();
    } catch { throw new DirectoryError('INVALID_DIRECTORY'); }
  }
  return normalized;
}
export function assertVersion(current: number, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 1) throw new DirectoryError('INVALID_DIRECTORY');
  if (current !== expected) throw new DirectoryError('VERSION_CONFLICT');
}
export function assertAcyclic(id: string, ancestorIds: readonly string[]): void {
  if (ancestorIds.includes(id) || new Set(ancestorIds).size !== ancestorIds.length) throw new DirectoryError('INVALID_HIERARCHY');
}
