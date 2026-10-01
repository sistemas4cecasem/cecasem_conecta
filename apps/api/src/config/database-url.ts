export function validateDatabaseUrl(value: unknown): string {
  const message = 'DATABASE_URL es obligatoria y debe ser una URL PostgreSQL válida con host y base de datos.';
  if (typeof value !== 'string' || !value || /\s/.test(value)) {
    throw new Error(message);
  }

  try {
    const url = new URL(value);
    if (
      !['postgresql:', 'postgres:'].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length <= 1 ||
      url.hash ||
      (url.port && (Number(url.port) < 1 || Number(url.port) > 65535))
    ) throw new Error(message);
  } catch {
    throw new Error(message);
  }
  return value;
}
