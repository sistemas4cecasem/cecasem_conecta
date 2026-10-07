import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY } from '../auth/session';
import { clearForbiddenAdministration } from './administration-cache';
import { apiRequest } from '../../lib/api/client';

const permissions = ['auth.first_access.issue','auth.password_reset.issue','users.read','users.deactivated.read',
  'users.create','users.role.update','users.status.update','users.mailboxes.manage'];
const identity = { id: 'admin', givenNames: 'Ana', familyNames: 'Admin', username: 'ana.admin', email: 'admin@example.test', role: 'ADMINISTRATOR', permissions };
const established = { id: 'diego', givenNames: 'Diego', familyNames: 'Prueba', username: 'diego.prueba', email: 'diego@example.test', role: 'RESEARCH', isActive: true,
  createdAt: new Date().toISOString(), deactivatedAt: null, credentialStatus: 'ESTABLISHED' };
const pending = { ...established, id: 'pending', givenNames: 'Pendiente', username: 'pendiente.prueba', credentialStatus: 'PENDING_FIRST_ACCESS' };
const account = { id: 'mailbox', address: 'institucional@example.test', displayName: 'Institucional', provider: null, isActive: true };

describe('Administración de usuarios y permisos', () => {
  let client = createQueryClient(); let current = { ...identity }; let rows = [established, pending];
  let assigned = false; let roleStatus = 204; let tokenStatus = 201;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); current = { ...identity }; rows = [established, pending]; assigned = false; roleStatus = 204; tokenStatus = 201;
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      const path = url.replace('/api/v1/', '');
      if (path === 'auth/me') return Promise.resolve(Response.json(current, { status: current.id ? 200 : 401 }));
      if (path === 'auth/logout') return Promise.resolve(new Response(null, { status: 204 }));
      if (path.startsWith('users?')) return Promise.resolve(Response.json(rows));
      if (path === 'users' && options?.method === 'POST') {
        const fields = JSON.parse(String(options.body)) as { givenNames: string; familyNames: string; email: string; role: string };
        rows = [...rows, { ...pending, ...fields, id: 'created' }]; return Promise.resolve(Response.json(rows.at(-1), { status: 201 }));
      }
      if (path.endsWith('/role')) {
        if (roleStatus === 409) return Promise.resolve(Response.json({ code: 'LAST_ADMINISTRATOR', message: 'fixture' }, { status: 409 }));
        const { role } = JSON.parse(String(options?.body)) as { role: string };
        if (path.includes('/admin/')) current = { ...current, role, permissions: role === 'BOARD' ? ['users.read'] : [] };
        return Promise.resolve(new Response(null, { status: roleStatus }));
      }
      if (path.includes('tokens')) return Promise.resolve(Response.json({ token: 'fixture-temporary-token', expiresAt: new Date(Date.now() + 60000).toISOString() }, { status: tokenStatus }));
      if (path.endsWith('/deactivate') || path.endsWith('/reactivate')) {
        if (path === 'users/admin/deactivate') current = { ...current, id: '' };
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (path === 'email-accounts') return Promise.resolve(Response.json(options?.method === 'POST' ? account : [account], { status: options?.method === 'POST' ? 201 : 200 }));
      if (path.endsWith('/email-accounts')) return Promise.resolve(Response.json(assigned ? [account] : []));
      if (path.includes('/email-accounts/')) { assigned = options?.method === 'PUT'; return Promise.resolve(new Response(null, { status: 204 })); }
      return Promise.reject(new Error(`Ruta inesperada: ${path}`));
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function app() {
    return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/users']}><AppRoutes /></MemoryRouter></QueryClientProvider>);
  }
  async function card(name: string) { return within(await screen.findByRole('article', { name })); }

  it.each(['RESEARCH','PLANNING'])('%s no ve navegación ni ejecuta consultas administrativas', async role => {
    current = { ...current, role, permissions: [] }; app();
    expect(await screen.findByRole('heading', { name: 'Acceso denegado' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Regresar a Inicio' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    expect(fetchMock.mock.calls.some(([url]) => url?.includes('/users?'))).toBe(false);
  });
  it('Board consulta únicamente activos, sin controles administrativos', async () => {
    current = { ...current, role: 'BOARD', permissions: ['users.read'] }; app(); await card('Diego Prueba');
    expect(screen.getAllByRole('link', { name: 'Usuarios' }).every(link => link.getAttribute('href') === '/users')).toBe(true);
    expect(screen.queryByRole('form', { name: 'Crear usuario' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    for (const name of ['Desactivar','Gestionar buzones','Generar primer acceso','Iniciar restablecimiento']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url?.includes('/users?')).every(([url]) => url?.endsWith('status=active'))).toBe(true);
  });
  it('Admin filtra activos/inactivos/todos y crea usuario sin contraseña ni username', async () => {
    const user = userEvent.setup(); app(); await card('Diego Prueba');
    await user.selectOptions(screen.getByLabelText('Mostrar usuarios'), 'inactive');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url?.endsWith('status=inactive'))).toBe(true));
    await user.selectOptions(screen.getByLabelText('Mostrar usuarios'), 'all');
    const form = within(screen.getByRole('form', { name: 'Crear usuario' }));
    await user.type(form.getByLabelText('Nombres'), 'Nueva'); await user.type(form.getByLabelText('Apellidos'), 'Persona');
    await user.type(form.getByLabelText('Correo electrónico'), 'new@example.test'); await user.click(form.getByRole('button', { name: 'Crear cuenta' }));
    await screen.findByRole('article', { name: 'Nueva Persona' });
    const call = fetchMock.mock.calls.find(([url, options]) => url.endsWith('/users') && options?.method === 'POST');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ givenNames: 'Nueva', familyNames: 'Persona', email: 'new@example.test', role: 'RESEARCH' });
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
  });
  it('el formulario valida entradas y muestra lista vacía/error/reintento', async () => {
    rows = []; const user = userEvent.setup(); app(); expect(await screen.findByText('No hay usuarios en este estado.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' })); expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    fetchMock.mockImplementationOnce(() => Promise.resolve(Response.json({ message: 'fixture' }, { status: 500 })));
    await act(() => client.invalidateQueries({ queryKey: ['users', identity.id] }));
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeVisible();
  });
  it.each(['Pendiente Prueba','Diego Prueba'])('%s recibe credencial efímera; cerrar/unmount borra y no hay cache ni storage', async name => {
    const user = userEvent.setup(); const mounted = app(); const row = await card(name);
    await user.click(row.getByRole('button', { name: name.startsWith('Pendiente') ? 'Generar primer acceso' : 'Iniciar restablecimiento' }));
    expect(await row.findByRole('region', { name: 'Credencial temporal' })).toHaveTextContent('#token=fixture-temporary-token');
    expect(JSON.stringify(client.getQueryCache().getAll().map(query => query.state.data))).not.toContain('fixture-temporary-token');
    expect(client.getMutationCache().getAll()).toHaveLength(0); expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
    await user.click(row.getByRole('button', { name: 'Cerrar credencial' })); expect(row.queryByRole('region', { name: 'Credencial temporal' })).not.toBeInTheDocument();
    mounted.unmount(); expect(screen.queryByText(/fixture-temporary-token/)).not.toBeInTheDocument();
  });
  it('perder permiso de emisión durante request no muestra respuesta tardía', async () => {
    let complete!: (response: Response) => void;
    const user = userEvent.setup(); app(); const row = await card('Pendiente Prueba');
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve; }));
    await user.click(row.getByRole('button', { name: 'Generar primer acceso' }));
    current = { ...current, role: 'BOARD', permissions: ['users.read'] };
    await act(async () => { client.setQueryData(AUTH_QUERY_KEY, current); });
    await act(async () => { complete(Response.json({ token: 'late-secret', expiresAt: new Date().toISOString() })); });
    expect(screen.queryByText(/late-secret/)).not.toBeInTheDocument();
  });
  it('muestra conflicto de último Admin y no envía roles sin cambios', async () => {
    rows = [{ ...established, ...identity, credentialStatus: 'ESTABLISHED' }]; const user = userEvent.setup(); app(); const row = await card('Ana Admin');
    expect(row.getByRole('button', { name: 'Guardar rol' })).toBeDisabled(); roleStatus = 409;
    await user.selectOptions(row.getByLabelText('Nuevo rol'), 'BOARD'); await user.click(row.getByRole('button', { name: 'Guardar rol' }));
    expect(await row.findByRole('alert')).toHaveTextContent('Debe permanecer al menos un Administrador activo.');
  });
  it.each(['BOARD','RESEARCH','PLANNING'])('autocambio a %s refresca me, limpia datos y reevalúa vista', async role => {
    rows = [{ ...established, ...identity, credentialStatus: 'ESTABLISHED' }]; const user = userEvent.setup(); app(); const row = await card('Ana Admin');
    client.setQueryData(['users', identity.id, 'inactive'], [pending]); client.setQueryData(['email-accounts', identity.id], [account]);
    await user.selectOptions(row.getByLabelText('Nuevo rol'), role); await user.click(row.getByRole('button', { name: 'Guardar rol' }));
    await waitFor(() => expect(client.getQueryData(AUTH_QUERY_KEY)).toMatchObject({ role }));
    expect(client.getQueryData(['users', identity.id, 'inactive'])).toBeUndefined(); expect(client.getQueryData(['email-accounts', identity.id])).toBeUndefined();
    if (role === 'BOARD') { expect(screen.getByRole('heading', { name: 'Usuarios' })).toBeVisible(); expect(screen.queryByRole('button', { name: 'Crear cuenta' })).not.toBeInTheDocument(); }
    else expect(await screen.findByRole('heading', { name: 'Acceso denegado' })).toBeVisible();
  });
  it('autodesactivación requiere confirmación, limpia privados y regresa a login', async () => {
    rows = [{ ...established, ...identity, credentialStatus: 'ESTABLISHED' }]; const user = userEvent.setup(); app(); const row = await card('Ana Admin');
    client.setQueryData(['private'], { private: true });
    await user.click(row.getByRole('button', { name: 'Desactivar' }));
    expect(row.getByText(/perderá acceso a CECASEM Conecta/)).toBeVisible();
    expect(row.getByText(/permanecerán en el historial/)).toBeVisible();
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/deactivate'))).toBe(false);
    await user.click(row.getByRole('button', { name: 'Confirmar desactivación' }));
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeVisible(); expect(client.getQueryData(['private'])).toBeUndefined();
  });
  it('registra catálogo y asigna/retira/reasigna buzón', async () => {
    const user = userEvent.setup(); app(); const row = await card('Diego Prueba'); await user.click(row.getByRole('button', { name: 'Gestionar buzones' }));
    await user.click(await row.findByRole('button', { name: `Asignar ${account.address}` }));
    await user.click(await row.findByRole('button', { name: `Retirar ${account.address}` }));
    await user.click(await row.findByRole('button', { name: `Asignar ${account.address}` }));
    const form = within(row.getByRole('form', { name: 'Registrar buzón' }));
    await user.type(form.getByLabelText('Nombre del buzón'), 'Cooperación'); await user.type(form.getByLabelText('Correo del buzón'), 'cooperacion@example.test');
    await user.click(form.getByRole('button', { name: 'Registrar buzón' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => url.endsWith('/email-accounts') && options?.method === 'POST')).toBe(true));
  });
  it('403 conserva sesión y provoca refetch acotado; 401 de emisión invalida sesión', async () => {
    const user = userEvent.setup(); app(); const row = await card('Pendiente Prueba'); tokenStatus = 403;
    await user.click(row.getByRole('button', { name: 'Generar primer acceso' }));
    expect(await row.findByRole('alert')).toHaveTextContent('No tienes permiso'); expect(client.getQueryData(AUTH_QUERY_KEY)).toMatchObject(identity);
    const event = vi.fn(); window.addEventListener('cecasem:unauthorized', event);
    tokenStatus = 401; await expect(apiRequest('auth/first-access-tokens', { method: 'POST' })).rejects.toMatchObject({ status: 401 });
    expect(event).toHaveBeenCalledTimes(1); window.removeEventListener('cecasem:unauthorized', event);
  });
  it('cache pertenece a identidad y capabilities, conserva solamente activos para Board', async () => {
    for (const key of [['users','other','active'], ['users',identity.id,'inactive'], ['users',identity.id,'active'], ['users',identity.id,'diego','email-accounts'], ['email-accounts',identity.id]]) client.setQueryData(key, []);
    await clearForbiddenAdministration(client, { ...identity, role: 'BOARD', permissions: ['users.read'] });
    expect(client.getQueryCache().getAll().map(query => query.queryKey)).toEqual([['users',identity.id,'active']]);
    await clearForbiddenAdministration(client, null); expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
