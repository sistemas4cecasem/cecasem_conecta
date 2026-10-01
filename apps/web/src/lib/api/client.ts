export class ApiError extends Error {
  constructor(message: string, public readonly status: number | null) {
    super(message);
    this.name = 'ApiError';
  }
}

function httpErrorMessage(status: number): string {
  switch (status) {
    case 400: return 'La solicitud no es válida. Revisa la información e intenta nuevamente.';
    case 401: return 'Se requiere autenticación para realizar esta acción.';
    case 403: return 'No tienes permiso para realizar esta acción.';
    case 404: return 'No se encontró la información solicitada.';
    case 409: return 'La solicitud entra en conflicto con la información actual. Actualiza e intenta nuevamente.';
    default: return 'No se pudo completar la solicitud. Intenta nuevamente más tarde.';
  }
}

// T representa el contrato esperado. La validación del contenido corresponde a
// cada consumidor cuando exista un contrato funcional que validar.
export async function apiRequest<T>(path: string, options: Omit<RequestInit, 'credentials'> = {}): Promise<T | undefined> {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path)) {
    throw new Error('El cliente API requiere una ruta relativa.');
  }

  const baseUrl = (import.meta.env.VITE_API_BASE_URL?.trim() || '/api/v1').replace(/\/+$/, '');
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/${path.replace(/^\/+/, '')}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError('No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.', null);
  }

  if (!response.ok) {
    if (response.status === 401 && !/^\/?auth(?:\/|$)/.test(path)) {
      window.dispatchEvent(new Event('cecasem:unauthorized'));
    }
    throw new ApiError(httpErrorMessage(response.status), response.status);
  }
  if (response.status === 204) return undefined;

  try {
    return await response.json() as T;
  } catch {
    throw new ApiError('El servidor devolvió una respuesta no válida. Intenta nuevamente más tarde.', response.status);
  }
}
