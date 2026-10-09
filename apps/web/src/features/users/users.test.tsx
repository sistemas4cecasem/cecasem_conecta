import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';

const permissions = ['users.read', 'users.deactivated.read', 'users.create', 'users.profile.update',
  'users.role.update', 'users.password.reset', 'users.status.update', 'users.mailboxes.manage'];
const identity = { id: 'admin', givenNames: 'Ana', familyNames: 'Admin', username: 'ana.admin', email: 'admin@example.test', role: 'ADMINISTRATOR', permissions };
const established = { id: 'diego', givenNames: 'Diego', familyNames: 'Prueba', username: 'diego.prueba', email: 'diego@example.test', role: 'RESEARCH', isActive: true,
  createdAt: new Date().toISOString(), deactivatedAt: null, credentialStatus: 'ESTABLISHED' };
const changeRequired = { ...established, id: 'pending', givenNames: 'Pendiente', username: 'pendiente.prueba', credentialStatus: 'CHANGE_REQUIRED' };
const account = { id: 'mailbox', address: 'institucional@example.test', displayName: 'Institucional', provider: null, isActive: true };

describe('Administración de usuarios', () => {
  let client = createQueryClient(); let current = { ...identity }; let rows = [established, changeRequired];
  let assigned = false;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    client = createQueryClient(); current = { ...identity }; rows = [established, changeRequired]; assigned = false;
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      const path = url.replace('/api/v1/', '');
      if (path === 'auth/me') return Promise.resolve(Response.json(current, { status: current.id ? 200 : 401 }));
      if (path === 'auth/logout') return Promise.resolve(new Response(null, { status: 204 }));
      if (path.startsWith('users?')) {
        const status = new URLSearchParams(path.split('?')[1]).get('status');
        return Promise.resolve(Response.json(rows.filter(row => status === 'all' || (status === 'inactive' ? !row.isActive : row.isActive))));
      }
      if (path === 'users' && options?.method === 'POST') {
        const fields = JSON.parse(String(options.body)) as { givenNames: string; familyNames: string; email: string; role: string };
        const created = { ...established, ...fields, id: 'created', username: 'nueva.persona', credentialStatus: 'CHANGE_REQUIRED' };
        rows = [...rows, created]; return Promise.resolve(Response.json(created, { status: 201 }));
      }
      const userId = path.match(/^users\/([^/]+)/)?.[1];
      if (userId && path.endsWith('/profile')) {
        const fields = JSON.parse(String(options?.body)) as { givenNames: string; familyNames: string; email: string };
        rows = rows.map(row => row.id === userId ? { ...row, ...fields } : row);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (userId && path.endsWith('/role')) {
        const { role } = JSON.parse(String(options?.body)) as { role: string };
        rows = rows.map(row => row.id === userId ? { ...row, role } : row);
        if (userId === current.id) current = { ...current, role, permissions: role === 'BOARD' ? ['users.read'] : permissions };
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (userId && path.endsWith('/password')) return Promise.resolve(new Response(null, { status: 204 }));
      if (userId && (path.endsWith('/deactivate') || path.endsWith('/reactivate'))) {
        rows = rows.map(row => row.id === userId ? { ...row, isActive: path.endsWith('/reactivate') } : row);
        if (userId === current.id && path.endsWith('/deactivate')) current = { ...current, id: '' };
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
  async function openUser(name: string) {
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`(?:Administrar|Ver) usuario ${name}`) }));
    return within(await screen.findByRole('article', { name }));
  }

  it('muestra el listado compacto y abre la administración individual', async () => {
    app();
    expect(await screen.findByRole('heading', { name: 'Usuarios registrados' })).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Crear usuario' })).not.toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Listado de usuarios registrados' });
    expect(within(table).getAllByText('Búsqueda')).toHaveLength(2);
    expect(within(table).getAllByText('Activo')).toHaveLength(2);
    expect(within(table).getByText('Debe cambiar la contraseña')).toBeVisible();
    const user = await openUser('Diego Prueba');
    expect(user.getByText('Identificador: diego.prueba')).toBeVisible();
    expect(user.getByRole('region', { name: 'Acceso y seguridad' })).toBeVisible();
    expect(user.getByRole('region', { name: 'Estado de cuenta' })).toBeVisible();
  });

  it('mantiene filtros y separa creación en una vista con dos grupos y regreso al listado', async () => {
    const user = userEvent.setup(); app(); await screen.findByRole('table', { name: 'Listado de usuarios registrados' });
    await user.selectOptions(screen.getByLabelText('Mostrar usuarios'), 'inactive');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('status=inactive'))).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }));
    expect(screen.getByRole('heading', { name: 'Crear usuario' })).toBeVisible();
    const form = within(screen.getByRole('form', { name: 'Crear usuario' }));
    expect(form.getByRole('group', { name: 'Datos de la cuenta' })).toBeVisible();
    expect(form.getByRole('group', { name: 'Acceso inicial' })).toBeVisible();
    await user.click(form.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('combobox', { name: 'Mostrar usuarios' })).toHaveValue('inactive');
    expect(screen.getByText('No hay usuarios en este estado.')).toBeVisible();
  });

  it('crea la cuenta con contraseña inicial, mantiene validación y vuelve al listado al guardar', async () => {
    const user = userEvent.setup(); app(); await screen.findByRole('table', { name: 'Listado de usuarios registrados' });
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }));
    const form = within(screen.getByRole('form', { name: 'Crear usuario' }));
    await user.click(form.getByRole('button', { name: 'Crear cuenta' }));
    expect(form.getByLabelText(/^Nombres/)).toHaveAttribute('aria-invalid', 'true');
    await user.type(form.getByLabelText(/^Nombres/), '  María  ');
    await user.type(form.getByLabelText(/^Apellidos/), '  QA  ');
    await user.type(form.getByLabelText(/^Correo electrónico/), '  MARIA@EXAMPLE.TEST  ');
    await user.type(form.getByLabelText('Contraseña inicial (obligatorio)'), 'NuevaClave!8');
    expect(form.getByText('Al menos 8 caracteres')).toHaveClass('is-satisfied');
    await user.click(form.getByRole('button', { name: 'Crear cuenta' }));
    await screen.findByText('nueva.persona');
    const call = fetchMock.mock.calls.find(([url, options]) => url.endsWith('/users') && options?.method === 'POST');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ givenNames: 'María', familyNames: 'QA', email: 'maria@example.test', role: 'RESEARCH', password: 'NuevaClave!8' });
  });

  it('guarda nombre y correo por separado del rol, y conserva la confirmación de estado', async () => {
    const user = userEvent.setup(); app(); const panel = await openUser('Diego Prueba');
    const profile = within(panel.getByRole('form', { name: 'Editar datos de diego.prueba' }));
    await user.clear(profile.getByLabelText(/^Nombres/)); await user.type(profile.getByLabelText(/^Nombres/), 'Diego Luis');
    await user.clear(profile.getByLabelText(/^Correo electrónico/)); await user.type(profile.getByLabelText(/^Correo electrónico/), 'diego.luis@example.test');
    await user.click(profile.getByRole('button', { name: 'Guardar información' }));
    expect(await profile.findByRole('status')).toHaveTextContent('Información de usuario actualizada.');
    const roleForm = within(panel.getByRole('form', { name: 'Cambiar rol de diego.prueba' }));
    await user.selectOptions(roleForm.getByLabelText('Nuevo rol'), 'PLANNING');
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PATCH' && String(options.body).includes('PLANNING'))).toBe(false);
    await user.click(roleForm.getByRole('button', { name: 'Guardar rol' }));
    await waitFor(() => expect(rows.find(row => row.id === 'diego')?.role).toBe('PLANNING'));
    const updatedPanel = within(await screen.findByRole('article', { name: 'Diego Luis Prueba' }));
    await user.click(updatedPanel.getByRole('button', { name: 'Desactivar' }));
    expect(updatedPanel.getByRole('group', { name: 'Confirmar cambio de estado' })).toBeVisible();
    await user.click(updatedPanel.getByRole('button', { name: 'Cancelar' }));
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/deactivate'))).toBe(false);
  });

  it('confirma desactivación y regresa al listado filtrado', async () => {
    const user = userEvent.setup(); app(); const panel = await openUser('Diego Prueba');
    await user.click(panel.getByRole('button', { name: 'Desactivar' }));
    await user.click(panel.getByRole('button', { name: 'Confirmar desactivación' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => url.endsWith('/deactivate') && options?.method === 'POST')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Administrar usuario Diego Prueba' })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Usuarios registrados' })).toBeVisible();
  });

  it('protege la última cuenta Administrador activa', async () => {
    rows = [{ ...established, ...identity, createdAt: established.createdAt, deactivatedAt: null, isActive: true, credentialStatus: 'ESTABLISHED' }];
    app(); const panel = await openUser('Ana Admin');
    expect(panel.getByRole('button', { name: 'Desactivar' })).toBeDisabled();
    expect(panel.getByText('Debe permanecer al menos un Administrador activo.')).toBeVisible();
  });

  it('mantiene contraseñas y buzones en superficies independientes con operaciones coexistentes', async () => {
    const user = userEvent.setup(); app(); const panel = await openUser('Diego Prueba');
    const access = within(panel.getByRole('region', { name: 'Acceso y seguridad' }));
    await user.click(access.getByRole('button', { name: 'Restablecer contraseña' }));
    const resetSurface = within(panel.getByRole('region', { name: 'Restablecer contraseña' }));
    const reset = within(resetSurface.getByRole('form', { name: 'Restablecer contraseña del usuario' }));
    await user.type(reset.getByLabelText('Contraseña inicial (obligatorio)'), 'Temporal!2026');
    await user.type(reset.getByLabelText('Confirmar contraseña inicial (obligatorio)'), 'Temporal!2026');
    await user.click(access.getByRole('button', { name: 'Gestionar buzones' }));
    const mailboxSurface = within(await panel.findByRole('region', { name: 'Gestión de buzones' }));
    expect(mailboxSurface.getByRole('region', { name: 'Buzones del usuario' })).toBeVisible();
    const roleForm = within(access.getByRole('form', { name: 'Cambiar rol de diego.prueba' }));
    await user.selectOptions(roleForm.getByLabelText('Nuevo rol'), 'PLANNING');
    await user.click(roleForm.getByRole('button', { name: 'Guardar rol' }));
    await waitFor(() => expect(rows.find(row => row.id === 'diego')?.role).toBe('PLANNING'));
    expect(reset.getByLabelText('Contraseña inicial (obligatorio)')).toHaveValue('Temporal!2026');
    expect(mailboxSurface.getByRole('region', { name: 'Buzones del usuario' })).toBeVisible();
    await user.click(reset.getByRole('button', { name: 'Guardar contraseña inicial' }));
    expect(await resetSurface.findByRole('status')).toHaveTextContent('Contraseña restablecida.');
    expect(fetchMock.mock.calls.some(([url, options]) => url.endsWith('/password') && options?.method === 'PATCH' && String(options.body).includes('Temporal!2026'))).toBe(true);
    await user.click(mailboxSurface.getByRole('button', { name: `Asignar ${account.address}` }));
    expect(await mailboxSurface.findByText('Institucional — institucional@example.test')).toBeVisible();
    const mailboxQueryCount = () => fetchMock.mock.calls.filter(([url]) => url.endsWith('/email-accounts')).length;
    const queriesAfterAssign = mailboxQueryCount();
    await user.click(access.getByRole('button', { name: 'Cerrar buzones' }));
    expect(document.getElementById('user-mailboxes-panel-diego')).toHaveAttribute('hidden');
    await user.click(access.getByRole('button', { name: 'Gestionar buzones' }));
    expect(await panel.findByRole('region', { name: 'Gestión de buzones' })).toBeVisible();
    expect(mailboxQueryCount()).toBe(queriesAfterAssign);
  });

  it('permite consultar como lectura sola y conserva controles de filtros según permisos', async () => {
    current = { ...current, role: 'BOARD', permissions: ['users.read'] }; app();
    await screen.findByRole('table', { name: 'Listado de usuarios registrados' });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    const panel = await openUser('Diego Prueba');
    expect(panel.getByText('diego@example.test')).toBeVisible();
    expect(panel.queryByRole('form', { name: 'Editar datos de diego.prueba' })).not.toBeInTheDocument();
    expect(panel.queryByRole('region', { name: 'Acceso y seguridad' })).not.toBeInTheDocument();
  });
});
