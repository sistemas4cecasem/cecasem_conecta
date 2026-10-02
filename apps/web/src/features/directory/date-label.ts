export function dateLabel(value: string | null): string {
  return value ? new Date(value).toLocaleString('es-BO') : 'Sin verificar';
}
