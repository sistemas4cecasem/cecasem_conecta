import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';

describe('Primer acceso público', () => {
  let client = createQueryClient();
  let authenticated = false;
  const identity = { id: 'fixture', givenNames: 'Ana', familyNames: 'Prueba', username: 'ana.prueba', email: 'fixture@example.test', role: 'ADMINISTRATOR', permissions: ['auth.first_access.issue', 'auth.password_reset.issue'] };
  const token = crypto.randomUUID().replaceAll('-', '') + '12345678901';
  const password = crypto.randomUUID();
  const fetchMock = vi.fn();
  let consumeResult: () => Promise<Response>;
  let logoutResult: () => Promise<Response>;

  beforeEach(() => {
    client = createQueryClient(); authenticated = false;
    window.history.replaceState({}, '', '/first-access'); localStorage.clear(); sessionStorage.clear();
    consumeResult = async () => new Response(null, { status: 204 });
    logoutResult = async () => { authenticated = false; return new Response(null, { status: 204 }); };
    fetchMock.mockReset().mockImplementation((url: string) => {
      if (url?.endsWith('/auth/me')) return Promise.resolve(authenticated ? Response.json(identity) : new Response(null, { status: 401 }));
      if (url?.endsWith('/auth/logout')) return logoutResult();
      if (url?.endsWith('/auth/first-access')) return consumeResult();
      throw new Error('Unexpected request');
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); window.history.replaceState({}, '', '/'); });
  function renderApp(fragment = false) {
    if (fragment) window.history.replaceState({}, '', `/first-access#token=${token}`);
    render(<StrictMode><QueryClientProvider client={client}><MemoryRouter initialEntries={['/first-access']}><AppRoutes /></MemoryRouter></QueryClientProvider></StrictMode>);
  }
  async function fillAndSubmit(inputPassword: string = password, confirmation: string = inputPassword) {
    const user = userEvent.setup(); await screen.findByRole('button', { name: 'Establecer contraseña' });
    if (!(screen.getByLabelText('Token de primer acceso') as HTMLInputElement).value) await user.type(screen.getByLabelText('Token de primer acceso'), token);
    await user.type(screen.getByLabelText('Contraseña nueva'), inputPassword); await user.type(screen.getByLabelText('Confirmar contraseña'), confirmation);
    await user.click(screen.getByRole('button', { name: 'Establecer contraseña' }));
  }
  it('UI 2.11 conserva controles protegidos y asocia ayudas sin consumo automático',async()=>{
    renderApp(); await screen.findByRole('button',{name:'Establecer contraseña'});
    expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1);
    expect(screen.getByLabelText('Token de primer acceso')).toHaveAttribute('type','password');
    expect(screen.getByLabelText('Token de primer acceso')).toHaveAttribute('autocomplete','off');
    expect(screen.getByLabelText('Token de primer acceso')).toHaveAccessibleDescription(/Al recargar tendrás que pegarla nuevamente/);
    expect(screen.getByLabelText('Contraseña nueva')).toHaveAttribute('autocomplete','new-password');
    expect(screen.getByLabelText('Confirmar contraseña')).toHaveAccessibleDescription(/15 y 128 caracteres/);
    expect(screen.getByText(/solicita otra al Administrador/)).toBeVisible();
    expect(fetchMock.mock.calls.every(([url]:string[])=>url?.endsWith('/auth/me'))).toBe(true);
  });
  it('UI 2.11 errores quedan asociados y no revelan una credencial en texto',async()=>{
    renderApp(); await screen.findByRole('button',{name:'Establecer contraseña'});
    await userEvent.click(screen.getByRole('button',{name:'Establecer contraseña'}));
    await screen.findByText('Introduce la credencial temporal recibida.');
    expect(screen.getByLabelText('Token de primer acceso')).toHaveAttribute('aria-invalid','true');
    expect(screen.getByLabelText('Token de primer acceso')).toHaveAccessibleDescription(/Introduce la credencial temporal recibida/);
    expect(screen.getByLabelText('Contraseña nueva')).toHaveAccessibleDescription(/La contraseña debe contener entre 15 y 128 caracteres/);
    expect(fetchMock.mock.calls.some(([,o])=>o?.method==='POST')).toBe(false);
  });
  it('extracts fragment, strips URL immediately under StrictMode and never validates the token on load', async () => {
    renderApp(true); expect(window.location.hash).toBe('');
    expect(await screen.findByLabelText('Token de primer acceso')).toHaveValue(token);
    expect(fetchMock.mock.calls.every(([url]: string[]) => url?.endsWith('/auth/me'))).toBe(true);
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it('accepts manual entry, sends no confirmation, stores no secret and returns to ordinary login', async () => {
    renderApp(); await fillAndSubmit();
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    expect(screen.getByText('Contraseña establecida correctamente. Ya puedes iniciar sesión.')).toBeVisible();
    const [, options] = fetchMock.mock.calls.find(([url]: string[]) => url?.endsWith('/auth/first-access'))!;
    expect(JSON.parse(options.body)).toEqual({ token, password }); expect(options.credentials).toBe('include');
    expect(client.getMutationCache().getAll()).toHaveLength(0); expect(JSON.stringify(client.getQueryCache().getAll().map((query) => query.state.data))).not.toContain(token);
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0); expect(window.location.href).not.toContain(token);
  });
  it.each([['short', 'short'], [password, 'different password']])('validates password and confirmation without HTTP consumption', async (input, confirmation) => {
    renderApp(true); await fillAndSubmit(input, confirmation);
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some(([url]: string[]) => url?.endsWith('/auth/first-access'))).toBe(false);
  });
  it('accepts NFC equivalent confirmation and Unicode code points', async () => {
    renderApp(true); await fillAndSubmit('é'.repeat(15), 'e\u0301'.repeat(15));
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });
  it('clears passwords during pending request and prevents double submit', async () => {
    let finish!: (response: Response) => void; consumeResult = () => new Promise((resolve) => { finish = resolve; });
    renderApp(true); await fillAndSubmit();
    expect(screen.getByLabelText('Contraseña nueva')).toHaveValue(''); expect(screen.getByLabelText('Confirmar contraseña')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Estableciendo contraseña…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Estableciendo contraseña…' })).toHaveAttribute('aria-busy','true');
    await userEvent.click(screen.getByRole('button', { name: 'Estableciendo contraseña…' }));
    expect(fetchMock.mock.calls.filter(([url]: string[]) => url?.endsWith('/auth/first-access'))).toHaveLength(1);
    finish(new Response(null, { status: 204 })); await screen.findByRole('heading', { name: 'Iniciar sesión' });
  });
  it.each(['expired', 'used', 'revoked', 'unknown'])('shows uniform error for %s token', async () => {
    consumeResult = async () => Response.json({ message: 'El enlace o token de primer acceso no es válido o ya no está disponible.' }, { status: 400 });
    renderApp(true); await fillAndSubmit(); expect(await screen.findByRole('alert')).toHaveTextContent('El enlace o token de primer acceso no es válido o ya no está disponible.');
  });
  it('keeps backend password-policy rejection distinct', async () => {
    consumeResult = async () => Response.json({ message: ['La contraseña nueva debe contener entre 15 y 128 caracteres.'] }, { status: 400 });
    renderApp(true); await fillAndSubmit(); expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña nueva debe contener entre 15 y 128 caracteres.');
  });
  it('distinguishes network failures and permits retry without retaining passwords', async () => {
    consumeResult = () => Promise.reject(new TypeError('network')); renderApp(true); await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar'); expect(screen.getByLabelText('Contraseña nueva')).toHaveValue('');
    expect(screen.getByLabelText('Token de primer acceso')).toHaveValue(token);
  });
  it('blocks an existing session and preserves token across explicit logout', async () => {
    authenticated = true; renderApp(true);
    expect(await screen.findByText(/Existe una sesión abierta de Ana/)).toBeVisible(); expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]: string[]) => url?.endsWith('/auth/logout'))).toBe(false);
    client.setQueryData(['private'], { private: true });
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión y continuar' }));
    expect(await screen.findByLabelText('Token de primer acceso')).toHaveValue(token); expect(client.getQueryData(['private'])).toBeUndefined();
    await fillAndSubmit(); expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });
  it('keeps session blocked on logout failure and sends no consumption', async () => {
    authenticated = true; logoutResult = async () => new Response(null, { status: 500 }); renderApp(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión y continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar');
    expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument(); expect(fetchMock.mock.calls.some(([url]: string[]) => url?.endsWith('/auth/first-access'))).toBe(false);
  });
  it('rechecks session after server reports a conflict', async () => {
    consumeResult = async () => { authenticated = true; return new Response(null, { status: 409 }); }; renderApp(true); await fillAndSubmit();
    expect(await screen.findByRole('button', { name: 'Cerrar sesión y continuar' })).toBeVisible();
  });
  it('does not consume while session verification fails and supports retry', async () => {
    let unavailable = true;
    fetchMock.mockImplementation(() => unavailable ? Promise.reject(new TypeError('network')) : Promise.resolve(new Response(null, { status: 401 })));
    renderApp(true);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo comprobar');
    unavailable = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Establecer contraseña' })).toBeVisible());
  });
});
