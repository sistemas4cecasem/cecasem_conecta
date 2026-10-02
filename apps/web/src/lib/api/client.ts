export class ApiError extends Error {
  constructor(message: string, public readonly status: number | null, public readonly code?: string) {
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
    if (response.status === 401 && (!/^\/?auth(?:\/|$)/.test(path) || /^auth\/(first-access-tokens|password-reset-tokens)$/.test(path))) {
      window.dispatchEvent(new Event('cecasem:unauthorized'));
    }
    if (response.status === 409 && /^(users(?:\/|$)|email-accounts(?:\/|$))/.test(path)) {
      const conflicts: Record<string, string> = {
        LAST_ADMINISTRATOR: 'Debe permanecer al menos un Administrador activo.',
        EMAIL_EXISTS: 'El correo ya está registrado.', ACCOUNT_EXISTS: 'El buzón ya está registrado.',
        ACCOUNT_INACTIVE: 'El buzón está inactivo.', USERNAME_EXHAUSTED: 'No se pudo generar un nombre de usuario disponible.',
      };
      try {
        const payload: unknown = await response.json();
        if (typeof payload === 'object' && payload !== null && 'code' in payload && typeof payload.code === 'string' &&
          Object.hasOwn(conflicts, payload.code)) throw new ApiError(conflicts[payload.code] ?? httpErrorMessage(409), 409, payload.code);
      } catch (failure) { if (failure instanceof ApiError) throw failure; }
    }
    if (response.status === 400 && (path === 'auth/first-access' || path === 'auth/password-reset')) {
      // Únicamente mensajes públicos conocidos; no reenviar cuerpos arbitrarios.
      const policyMessage = 'La contraseña nueva debe contener entre 15 y 128 caracteres.';
      const messages = path === 'auth/password-reset' ? [policyMessage, 'La nueva contraseña debe ser diferente de la contraseña actual.'] : [policyMessage];
      try {
        const payload: unknown = await response.json();
        if (typeof payload === 'object' && payload !== null && 'message' in payload &&
          (typeof payload.message === 'string' || Array.isArray(payload.message))) {
          const known = messages.find((message) => payload.message === message || (Array.isArray(payload.message) && payload.message.includes(message)));
          if (known) throw new ApiError(known, 400);
        }
      } catch (failure) { if (failure instanceof ApiError) throw failure; }
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
