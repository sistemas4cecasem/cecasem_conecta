import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY } from './session';
import { AppProviders } from '../../app/providers/app-providers';
import { ApiError, apiRequest } from '../../lib/api/client';

describe('Autenticación completa en interfaz', () => {
  let client = createQueryClient();
  let authenticated = false;
  const identity = { id: 'fixture', givenNames: 'Ana', familyNames: 'Prueba', username: 'ana.prueba', email: 'fixture@example.test', role: 'RESEARCH', permissions: [] };
  const password = crypto.randomUUID();
  let loginResult: () => Promise<Response>;
  let logoutResult: () => Promise<Response>;
  const fetchMock = vi.fn();

  beforeEach(() => {
    client = createQueryClient(); authenticated = false;
    loginResult = async () => { authenticated = true; return Response.json(identity); };
    logoutResult = async () => { authenticated = false; return new Response(null, { status: 204 }); };
    fetchMock.mockReset().mockImplementation((url: string) => {
      if (url.endsWith('/auth/me')) return Promise.resolve(authenticated ? Response.json(identity) : new Response(null, { status: 401 }));
      if (url.endsWith('/auth/login')) return loginResult();
      if (url.endsWith('/auth/logout')) return logoutResult();
      throw new Error('Unexpected request');
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear(); sessionStorage.clear();
  });
  afterEach(() => client.clear());

  function renderApp(path = '/login') {
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></QueryClientProvider>);
  }
  async function fillLogin() {
    await screen.findByRole('heading', { name: 'Iniciar sesión' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Correo electrónico'), 'fixture@example.test');
    await user.type(screen.getByLabelText('Contraseña'), password);
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  }

  it('redirects anonymous protected access to the login without flashing protected content', async () => {
    renderApp('/');
    expect(screen.getByRole('status')).toHaveTextContent('Comprobando sesión');
    expect(screen.queryByRole('heading', { name: 'CECASEM Conecta' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });
  it('validates fields before submitting', async () => {
    renderApp();
    await screen.findByRole('heading', { name: 'Iniciar sesión' });
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByText('Introduce un correo válido.')).toBeVisible();
    expect(screen.getByText('Introduce tu contraseña.')).toBeVisible();
    expect(fetchMock.mock.calls.filter(([url]: string[]) => url?.endsWith('/login'))).toHaveLength(0);
  });
  it('clears password while pending and displays a generic 401 error', async () => {
    let finish!: (response: Response) => void;
    loginResult = () => new Promise((resolve) => { finish = resolve; });
    renderApp(); await fillLogin();
    expect(screen.getByRole('button', { name: 'Ingresando…' })).toBeDisabled();
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    finish(new Response(null, { status: 401 }));
    expect(await screen.findByText('Credenciales no válidas. Revisa tu correo y contraseña.')).toBeVisible();
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
  });
  it('distinguishes network errors from invalid credentials', async () => {
    loginResult = () => Promise.reject(new TypeError('network'));
    renderApp(); await fillLogin();
    expect(await screen.findByText(/No se pudo conectar con el servidor/)).toBeVisible();
  });
  it('logs in, clears previous data and does not persist credentials or tokens', async () => {
    client.setQueryData(['private', 'previous'], { private: true });
    renderApp(); await fillLogin();
    expect(await screen.findByRole('heading', { name: 'CECASEM Conecta' })).toBeVisible();
    expect(client.getQueryData(['private', 'previous'])).toBeUndefined();
    expect(client.getQueryData(AUTH_QUERY_KEY)).toEqual(identity);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
    const [, options] = fetchMock.mock.calls.find(([url]: string[]) => url?.endsWith('/login'))!;
    expect(options.credentials).toBe('include');
    expect(JSON.parse(options.body)).toEqual({ email: 'fixture@example.test', password });
  });
  it('logs out and removes user-associated cache', async () => {
    authenticated = true; renderApp('/');
    await screen.findByRole('button', { name: 'Cerrar sesión' });
    client.setQueryData(['private'], { private: true });
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    expect(client.getQueryData(['private'])).toBeUndefined();
    expect(client.getQueryData(AUTH_QUERY_KEY)).toBeNull();
  });
  it('does not claim logout success when the server fails', async () => {
    authenticated = true; logoutResult = async () => new Response(null, { status: 500 });
    renderApp('/');
    await screen.findByRole('button', { name: 'Cerrar sesión' });
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar');
    expect(screen.getByRole('heading', { name: 'CECASEM Conecta' })).toBeVisible();
  });
  it('redirects after the session expires on the server', async () => {
    authenticated = true; renderApp('/');
    await screen.findByRole('heading', { name: 'CECASEM Conecta' });
    authenticated = false;
    await client.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });
  it('keeps protected content hidden during a network failure and supports retry', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network'));
    renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo comprobar');
    expect(screen.queryByRole('heading', { name: 'CECASEM Conecta' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible());
  });
  it('invalidates identity and private cache after a 401 from a future protected endpoint', async () => {
    function CacheProbe() { client = useQueryClient(); return null; }
    authenticated = true;
    render(<AppProviders><MemoryRouter><CacheProbe /><AppRoutes /></MemoryRouter></AppProviders>);
    await screen.findByRole('heading', { name: 'CECASEM Conecta' });
    client.setQueryData(['private'], { private: true });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(apiRequest('future-protected')).rejects.toBeInstanceOf(ApiError);
    expect(client.getQueryData(AUTH_QUERY_KEY)).toBeNull();
    expect(client.getQueryData(['private'])).toBeUndefined();
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });
  it.each(['ADMINISTRATOR', 'BOARD', 'RESEARCH', 'PLANNING'])('conserva Inicio y logout para %s', async role => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...identity, role,
      permissions: role === 'ADMINISTRATOR' ? ['auth.first_access.issue', 'auth.password_reset.issue', 'users.read'] : role === 'BOARD' ? ['users.read'] : [] }));
    renderApp('/');
    const navigation = await screen.findByRole('navigation', { name: 'Navegación principal' });
    expect(within(navigation).getAllByRole('link')).toHaveLength(role === 'ADMINISTRATOR' || role === 'BOARD' ? 2 : 1);
    expect(within(navigation).getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  });
  it('actualiza rol y capabilities al refrescar me sin volver a iniciar sesión', async () => {
    let role = 'ADMINISTRATOR';
    fetchMock.mockImplementation(() => Promise.resolve(Response.json({ ...identity, role,
      permissions: role === 'ADMINISTRATOR' ? ['auth.first_access.issue', 'auth.password_reset.issue'] : [] })));
    renderApp('/');
    expect(await screen.findByText('Administrador')).toBeVisible();
    role = 'BOARD'; await client.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    expect(await screen.findByText('Directorio')).toBeVisible();
    expect(client.getQueryData(AUTH_QUERY_KEY)).toMatchObject({ role: 'BOARD', permissions: [] });
    role = 'ADMINISTRATOR'; await client.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    expect(await screen.findByText('Administrador')).toBeVisible();
    expect(client.getQueryData(AUTH_QUERY_KEY)).toMatchObject({ permissions: ['auth.first_access.issue', 'auth.password_reset.issue'] });
    expect(fetchMock.mock.calls.every(([url]: string[]) => url?.endsWith('/auth/me'))).toBe(true);
  });
  it('un 403 conserva la identidad y la sesión autenticada', async () => {
    function CacheProbe() { client = useQueryClient(); return null; }
    authenticated = true;
    render(<AppProviders><MemoryRouter><CacheProbe /><AppRoutes /></MemoryRouter></AppProviders>);
    await screen.findByRole('heading', { name: 'CECASEM Conecta' });
    client.setQueryData(['private'], { private: true });
    fetchMock.mockResolvedValueOnce(Response.json({ message: 'No tiene los permisos necesarios.' }, { status: 403 }));
    await expect(apiRequest('auth/first-access-tokens', { method: 'POST' })).rejects.toMatchObject({ status: 403 });
    expect(client.getQueryData(AUTH_QUERY_KEY)).toEqual(identity);
    expect(client.getQueryData(['private'])).toEqual({ private: true });
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]: string[]) => url?.endsWith('/auth/logout'))).toBe(false);
  });
});
