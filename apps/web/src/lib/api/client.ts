export class ApiError extends Error {
  constructor(message: string, public readonly status: number | null, public readonly code?: string, public readonly details?: { contactMethodId?: string; principalId?: string; principalPath?: string }) {
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
export async function apiRequest<T>(path: string, options: Omit<RequestInit, 'credentials'> = {}, responseType: 'json' | 'blob' = 'json'): Promise<T | undefined> {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path)) {
    throw new Error('El cliente API requiere una ruta relativa.');
  }

  const baseUrl = (import.meta.env.VITE_API_BASE_URL?.trim() || '/api/v1').replace(/\/+$/, '');
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', responseType === 'blob' ? 'application/octet-stream' : 'application/json');

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
    if (/^meetings(?:\/|\?|$)/.test(path)) {
      const payload: unknown = await response.clone().json().catch(() => null);
      const messages: Record<string, string> = {
        INVALID_MEETING: 'Revisa la fecha, modalidad y datos disponibles de la reunión.',
        INVALID_MEETING_ORIGIN: 'Selecciona un proceso u oportunidad existente y vínculos coherentes.',
        INVALID_TIMEZONE: 'Indica una zona horaria IANA válida, por ejemplo America/La_Paz.',
        NONEXISTENT_LOCAL_TIME: 'Esta hora local no existe por un cambio de horario. Elige otra hora.',
        AMBIGUOUS_LOCAL_TIME: 'Esta hora local ocurre dos veces. Selecciona la primera o segunda ocurrencia.',
        VERSION_CONFLICT: 'Otra persona cambió la reunión. Recarga y revisa los cambios antes de reintentar.',
        REQUEST_CONFLICT: 'Este intento ya registró otro comando. Revisa el resultado antes de continuar.',
        MEETING_REFERENCE_UNAVAILABLE: 'La ficha seleccionada cambió o ya no está disponible. Revisa la selección.',
        DUPLICATE_PARTICIPANT: 'Ese usuario o persona ya participa en esta reunión.',
        MEETING_STATE_CONFLICT: 'El estado o la fecha de la reunión no permite esta acción. Revisa sus datos actuales.',
        MEETING_CANCELLED: 'La reunión está cancelada; se conservan sus adjuntos, pero no admite nuevas cargas.',
      };
      if (typeof payload === 'object' && payload !== null && 'code' in payload && typeof payload.code === 'string' && Object.hasOwn(messages, payload.code)) throw new ApiError(messages[payload.code]!, response.status, payload.code);
    }
    if (/^(?:referrals\/|communications\/[^/]+\/referrals(?:\?|$))/.test(path)) {
      const payload: unknown = await response.clone().json().catch(() => null);
      const messages: Record<string, string> = {
        REQUEST_CONFLICT: 'Este intento ya registró datos diferentes. Revisa el resultado antes de iniciar un nuevo registro.',
        REFERRAL_SOURCE_INVALIDATED: 'La comunicación fue invalidada y no admite nuevos contactos recomendados.',
        REFERRAL_REFERENCE_UNAVAILABLE: 'Una ficha cambió o el medio no corresponde. Revisa el Directorio y vuelve a seleccionar.',
        INVALID_REFERRAL: 'Revisa la información disponible y el medio recomendado. No es necesario completar datos desconocidos.',
      };
      if (typeof payload === 'object' && payload !== null && 'code' in payload && typeof payload.code === 'string' && Object.hasOwn(messages, payload.code)) throw new ApiError(messages[payload.code]!, response.status, payload.code);
    }
    if (/^(files\/|(?:communications|relationship-processes|opportunities)\/[^/]+\/attachments)/.test(path)) {
      const payload: unknown = await response.clone().json().catch(() => null);
      const messages: Record<string, string> = {
        INVALID_UPLOAD: 'Selecciona de 1 a 10 archivos no vacíos con nombres válidos.',
        FILE_TOO_LARGE: 'Un archivo supera el límite de tamaño permitido.',
        UNSUPPORTED_FILE: 'Un archivo no coincide con un tipo permitido. Revisa su extensión y contenido.',
        OPPORTUNITY_CLOSED: 'La oportunidad está descartada o finalizada; no admite nuevos adjuntos.',
        RESOURCE_CLOSED: 'El proceso está cerrado; no admite nuevas cargas directas.',
        COMMUNICATION_INVALIDATED: 'La comunicación está invalidada; no admite nuevos adjuntos.',
        FILE_UNAVAILABLE: 'El archivo no está disponible o no superó la comprobación de integridad.',
        REQUEST_CONFLICT: 'Esta solicitud ya registró otra carga. Revisa los adjuntos existentes.',
      };
      if (typeof payload === 'object' && payload !== null && 'code' in payload && typeof payload.code === 'string' && Object.hasOwn(messages, payload.code)) throw new ApiError(messages[payload.code] ?? httpErrorMessage(response.status), response.status, payload.code);
    }
    if (/^opportunities(?:\/|\?|$)/.test(path)) {
      const payload: unknown = await response.clone().json().catch(() => null);
      const messages: Record<string, string> = { VERSION_CONFLICT: 'La oportunidad cambió. Conserva tu borrador, recarga y revisa antes de confirmar.', REQUEST_CONFLICT: 'Esta solicitud ya creó otra oportunidad. Revisa el registro antes de continuar.', INVALID_OPPORTUNITY_TRANSITION: 'El cambio de estado no está permitido.', INVALID_OPPORTUNITY_ORIGIN: 'El origen no existe o la comunicación no pertenece al proceso indicado.', OPPORTUNITY_ORGANIZATION_UNAVAILABLE: 'Selecciona organizaciones activas sin consolidar.', INVALID_OPPORTUNITY: 'Revisa el nombre, la fecha, las organizaciones y los campos de la oportunidad.' };
      if (typeof payload === 'object' && payload !== null && 'code' in payload && typeof payload.code === 'string' && Object.hasOwn(messages, payload.code)) throw new ApiError(messages[payload.code]!, response.status, payload.code);
    }
    if (response.status === 409 && (path.startsWith('communications/') || /relationship-processes\/[^/]+\/communications/.test(path))) {
      const payload: unknown = await response.clone().json().catch(() => null);
      const messages: Record<string, string> = { MAILBOX_UNAVAILABLE: 'La cuenta ya no está habilitada y asignada a tu usuario. Recarga tus cuentas disponibles.',
        PROCESS_CLOSED: 'El proceso está cerrado. Debe reabrirse mediante la acción autorizada antes de registrar otra comunicación.',
        REQUEST_CONFLICT: 'Esta solicitud ya registró otro contenido. Revisa las comunicaciones del proceso antes de continuar.' };
      if (typeof payload === 'object' && payload !== null && 'code' in payload && typeof payload.code === 'string' && Object.hasOwn(messages, payload.code)) throw new ApiError(messages[payload.code]!, 409, payload.code);
    }
    if (response.status === 409 && /^(contact-restrictions|contact-intents|relationship-processes)(?:\/|\?|$)/.test(path)) {
      const payload: unknown = await response.clone().json().catch(() => null);
      const messages: Record<string, string> = {
        CONTACT_RESTRICTED: 'RESTRICCIÓN ACTIVA — NO CONTACTAR. No se puede iniciar este acercamiento. Revisa la restricción institucional.',
        RESTRICTION_ALREADY_ACTIVE: 'Este objetivo ya tiene una restricción activa. Revisa su historial.',
        RESTRICTION_ALREADY_LIFTED: 'La restricción ya fue levantada. Recarga y revisa su historial.',
        RESTRICTION_TARGET_UNAVAILABLE: 'El objetivo no está disponible. Selecciona una ficha activa sin consolidar; para una persona con vínculo vigente, utiliza su organización.',
      };
      if (path.startsWith('contact-restrictions')) messages.VERSION_CONFLICT = 'La restricción cambió. Recarga y revisa su estado antes de continuar.';
      if (typeof payload === 'object' && payload !== null && 'code' in payload && typeof payload.code === 'string' && Object.hasOwn(messages, payload.code)) {
        throw new ApiError(messages[payload.code]!, 409, payload.code);
      }
    }
    if (response.status === 401 && (!/^\/?auth(?:\/|$)/.test(path) || /^auth\/(first-access-tokens|password-reset-tokens)$/.test(path))) {
      window.dispatchEvent(new Event('cecasem:unauthorized'));
    }
    if (response.status === 409 && path === 'settings/verification') {
      throw new ApiError('Los intervalos cambiaron. Recarga y revisa tu propuesta.', 409, 'VERSION_CONFLICT');
    }
    if (response.status === 409 && /^relationship-processes(?:\/|$)/.test(path)) {
      const messages: Record<string, string> = {
        VERSION_CONFLICT: 'El proceso cambió. Recarga y revisa su estado antes de continuar.',
        INVALID_TRANSITION: 'El cambio de estado no está permitido. Revisa el estado actual.',
        PROCESS_ALREADY_CLOSED: 'El proceso ya está cerrado. Recarga y revisa su historial.',
        PROCESS_NOT_CLOSED: 'Solo puede reabrirse un proceso cerrado. Recarga y revisa su estado.',
        PROCESS_TARGET_UNAVAILABLE: 'Selecciona una ficha activa sin consolidar; para una persona con vínculo vigente, utiliza su organización.',
      };
      try {
        const payload: unknown = await response.json();
        if (typeof payload === 'object' && payload !== null && 'code' in payload && typeof payload.code === 'string' && Object.hasOwn(messages, payload.code)) {
          throw new ApiError(messages[payload.code]!, 409, payload.code);
        }
      } catch (failure) { if (failure instanceof ApiError) throw failure; }
    }
    if (response.status === 409 && /^contact-intents(?:\/|$)/.test(path)) {
      const messages: Record<string, string> = {
        VERSION_CONFLICT: 'La intención cambió. Recarga y revisa su estado antes de continuar.',
        INTENT_NOT_ACTIVE: 'La intención ya no está activa. Recarga y revisa su estado.',
        INTENT_TARGET_UNAVAILABLE: 'El objetivo ya no está disponible. Selecciona una ficha activa sin consolidar; para una persona con vínculo vigente, utiliza su organización.',
      };
      try {
        const payload: unknown = await response.json();
        if (typeof payload === 'object' && payload !== null && 'code' in payload && typeof payload.code === 'string' && Object.hasOwn(messages, payload.code)) {
          throw new ApiError(messages[payload.code]!, 409, payload.code);
        }
      } catch (failure) { if (failure instanceof ApiError) throw failure; }
    }
    if (response.status === 409 && /^(duplicate-candidates(?:\/|$)|users(?:\/|$)|email-accounts(?:\/|$)|organizations(?:\/|$)|categories(?:\/|$)|people(?:\/|$)|person-organization-relations(?:\/|$)|contact-methods(?:\/|$)|person-contacts(?:\/|$)|organization-contacts(?:\/|$))/.test(path)) {
      const conflicts: Record<string, string> = {
        DUPLICATE_CANDIDATE_STALE: 'Las fichas cambiaron. Reevalúa la coincidencia antes de decidir.',
        ACTOR_ALREADY_CONSOLIDATED: 'Esta ficha fue consolidada. Abre el registro principal.',
        INVALID_CONSOLIDATION_TARGET: 'La selección de principal no es válida o produciría una cadena de consolidación.',
        CONSOLIDATION_VERSION_CONFLICT: 'La vista previa cambió. Recarga, revisa y confirma nuevamente.',
        CONSOLIDATION_HIERARCHY_CONFLICT: 'La consolidación afectaría una matriz, sede o jerarquía. Conserva las fichas separadas.',
        CONSOLIDATION_CONFIRMATION_REQUIRED: 'Revisa y confirma los efectos de consolidar.',
        VERSION_CONFLICT: 'La ficha cambió desde que la abriste. Recarga y revisa tus cambios.',
        INVALID_HIERARCHY: 'La relación matriz/sede produciría un ciclo. Elige otra matriz.',
        CATEGORY_EXISTS: 'Ya existe una categoría con ese nombre.',
        CATEGORY_INACTIVE: 'No puedes asignar una categoría inactiva.',
        LAST_ADMINISTRATOR: 'Debe permanecer al menos un Administrador activo.',
        EMAIL_EXISTS: 'El correo ya está registrado.', ACCOUNT_EXISTS: 'El buzón ya está registrado.',
        ACCOUNT_INACTIVE: 'El buzón está inactivo.', USERNAME_EXHAUSTED: 'No se pudo generar un nombre de usuario disponible.',
        CONTACT_EMAIL_EXISTS: 'Este correo ya está registrado. Revisa su ficha y confirma si deseas asociarlo.',
        CONTACT_VALUE_EXISTS: 'Este correo pertenece a otro medio. Puedes sustituir explícitamente la asociación conservando el antecedente.',
        SHARED_CONTACT_CONFIRMATION_REQUIRED: 'Confirma la corrección global después de revisar las asociaciones afectadas.',
        CONTACT_UNUSABLE: 'El medio está marcado como no utilizable. Un Administrador puede cambiar su condición.',
        INVALID_CONTACT_REPLACEMENT: 'Selecciona otro medio activo y confirma la sustitución.',
      };
      try {
        const payload: unknown = await response.json();
        if (typeof payload === 'object' && payload !== null && 'code' in payload && typeof payload.code === 'string' &&
          Object.hasOwn(conflicts, payload.code)) {
          let details: ApiError['details'];
          if ('details' in payload && typeof payload.details === 'object' && payload.details !== null &&
            'contactMethodId' in payload.details && typeof payload.details.contactMethodId === 'string' &&
            /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(payload.details.contactMethodId)) details = { contactMethodId: payload.details.contactMethodId };
          if ('details' in payload && typeof payload.details === 'object' && payload.details !== null &&
            'principalId' in payload.details && typeof payload.details.principalId === 'string' &&
            /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(payload.details.principalId) &&
            'principalPath' in payload.details && typeof payload.details.principalPath === 'string' &&
            ['organizations/' + payload.details.principalId, 'people/' + payload.details.principalId].includes(payload.details.principalPath)) {
            details = { principalId: payload.details.principalId, principalPath: payload.details.principalPath };
          }
          throw new ApiError(conflicts[payload.code] ?? httpErrorMessage(409), 409, payload.code, details);
        }
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

  if (responseType === 'blob') return await response.blob() as T;
  try {
    return await response.json() as T;
  } catch {
    throw new ApiError('El servidor devolvió una respuesta no válida. Intenta nuevamente más tarde.', response.status);
  }
}
