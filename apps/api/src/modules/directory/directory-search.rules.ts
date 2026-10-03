import { normalizeEmail } from '../users/identity-normalization';

export function normalizeSearchName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' ');
}
export function searchInput(value: string) {
  const q = value.trim().replace(/\s+/gu, ' ');
  if (q.length < 2 || q.length > 254) throw new Error('Consulta de búsqueda inválida.');
  if (q.includes('@')) return { q, name: '', email: normalizeEmail(q) };
  const name = normalizeSearchName(q);
  if (name.length < 2 || name.split(' ').length > 12) throw new Error('Consulta de búsqueda inválida.');
  return { q, name, email: null };
}
