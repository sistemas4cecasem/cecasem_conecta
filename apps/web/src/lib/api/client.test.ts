import { describe, expect, it, vi } from 'vitest';
import { apiRequest } from './client';

describe('Cliente API', () => {
  it('conserva el principal público de un conflicto de consolidación', async () => {
    const principalId='11111111-1111-4111-8111-111111111111',principalPath='organizations/'+principalId;
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({code:'ACTOR_ALREADY_CONSOLIDATED',details:{principalId,principalPath},stack:'secreto'},{status:409})));
    await expect(apiRequest('people/fixture')).rejects.toMatchObject({code:'ACTOR_ALREADY_CONSOLIDATED',details:{principalId,principalPath},message:expect.not.stringContaining('secreto')});
  });
  it.each(['https://evil.example.test','//evil.example.test','organizations/otro'])('no utiliza una redirección arbitraria %s del error HTTP', async principalPath => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({code:'ACTOR_ALREADY_CONSOLIDATED',details:{principalId:'11111111-1111-4111-8111-111111111111',principalPath}},{status:409})));
    await expect(apiRequest('duplicate-candidates/fixture/consolidate')).rejects.toMatchObject({code:'ACTOR_ALREADY_CONSOLIDATED',details:undefined});
  });
  it('usa /api/v1 y prepara cookies sin perder opciones del consumidor', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await apiRequest<{ status: string }>('/health', { headers: { 'X-Request-Id': 'test' } });
    expect(result).toEqual({ status: 'ok' });
    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/health');
    expect(options?.credentials).toBe('include');
    const headers = new Headers(options?.headers);
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('X-Request-Id')).toBe('test');
  });

  it('respeta la URL configurable y no duplica separadores', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/api/v1/');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest('/health');
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/v1/health', expect.any(Object));
  });

  it.each([400, 401, 403, 404, 409, 500])('representa HTTP %i sin exponer el cuerpo del error', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('detalle interno', { status })));
    await expect(apiRequest('health')).rejects.toMatchObject({ name: 'ApiError', status, message: expect.not.stringContaining('detalle interno') });
  });

  it('representa un fallo de red con un mensaje utilizable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiRequest('health')).rejects.toMatchObject({ status: null, message: expect.stringContaining('Revisa tu conexión') });
  });

  it('acepta respuestas sin contenido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiRequest<void>('resource', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('controla respuestas JSON inválidas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>respuesta inesperada</html>')));
    await expect(apiRequest('health')).rejects.toMatchObject({ name: 'ApiError', status: 200, message: expect.stringContaining('respuesta no válida') });
  });

  it('preserva la cancelación solicitada por el consumidor', async () => {
    const controller = new AbortController();
    const abortError = new DOMException('Cancelado', 'AbortError');
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));
    await expect(apiRequest('health', { signal: controller.signal })).rejects.toBe(abortError);
  });

  it('rechaza URLs absolutas como ruta antes de enviar credenciales', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('https://example.test')).rejects.toThrow('ruta relativa');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
