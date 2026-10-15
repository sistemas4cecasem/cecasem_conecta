import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { clearForbiddenDirectory } from './queries';
import { organizationFormSchema, type Organization } from './contracts';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';

const capabilities = ['directory.read', 'directory.write', 'directory.history.read'];
const identity: AuthIdentity = { id: 'qa', givenNames: 'QA', familyNames: 'Directorio', username: 'qa.directorio', email: 'qa@example.test', role: 'RESEARCH', permissions: capabilities };
const stamp = '2026-10-02T00:00:00.000Z';
const catA = { id: 'cat-a', name: 'Educación QA', isActive: true, version: 1, createdAt: stamp, updatedAt: stamp };
const catB = { ...catA, id: 'cat-b', name: 'Ambiente QA' };
const base: Organization = { id: 'org', name: 'Institución QA', country: null, alias: null, description: null, officialWebsite: null,
  isActive: true, version: 1, branchOfId: null, branchOf: null, interestAreas: [], createdAt: stamp, updatedAt: stamp, };
const branchOwner = { id: 'branch-owner', name: 'Organización regional', isActive: true };
const page = (items: unknown[], total = items.length, number = 1) => ({ items, total, page: number, pageSize: 25 });

describe('Directorio operativo', () => {
  let client = createQueryClient(); let current = identity; let row = { ...base };
  let branchFailure=false;
  let listState = 'ok'; let conflicting = false; let detailStatus = 200; let total = 1; let withCategories = true; let loggedOut = false; let showHistory = false;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    branchFailure=false;client = createQueryClient(); current = { ...identity }; row = { ...base }; listState = 'ok'; conflicting = false; detailStatus = 200; total = 1; withCategories = true; loggedOut = false; showHistory = false;
    fetchMock.mockReset();
    fetchMock.mockImplementation((url, options) => {
      const path = url.replace('/api/v1/', '');
      if (url.includes('/duplicate-candidates?')) return Promise.resolve(Response.json({items:[],total:0,page:1,pageSize:25})); const method = options?.method ?? 'GET';
      if (path === 'auth/me') return Promise.resolve(Response.json(loggedOut ? {} : current, { status: loggedOut ? 401 : 200 }));
      if (path === 'auth/logout') { loggedOut = true; return Promise.resolve(new Response(null, { status: 204 })); }
      if (path.startsWith('categories?')) return Promise.resolve(Response.json(page(withCategories ? [catA, catB] : [])));
      if (path === 'categories' && method === 'POST') return Promise.resolve(Response.json({ ...catA, ...(JSON.parse(String(options?.body)) as object) }, { status: 201 }));
      if (path.includes('/history')) return Promise.resolve(Response.json({
        ...page(showHistory ? [{operationId:'operation-qa',createdAt:stamp,objectType:'ORGANIZATION',actor:{id:identity.id,givenNames:identity.givenNames,familyNames:identity.familyNames,isActive:true},contextRecorded:true,relatedReferences:[],replacement:null,changes:[{field:'categoryIds',label:'Categorías',previousValue:[],newValue:[catA.id,catB.id],previousReferences:[],newReferences:[{id:catA.id,kind:'category',label:catA.name},{id:catB.id,kind:'category',label:catB.name}],added:[{id:catA.id,kind:'category',label:catA.name},{id:catB.id,kind:'category',label:catB.name}],removed:[]}]}] : []),
        references: { [catA.id]: catA.name, [catB.id]: catB.name },
      }));
      if(path==='organizations/org/branches'&&method==='POST'&&branchFailure)return Promise.resolve(Response.json({code:'CONTACT_EMAIL_EXISTS'},{status:409}));
      if(path==='organizations/org/branches'&&method==='POST')return Promise.resolve(Response.json({...base,id:'branch',name:row.name,...JSON.parse(String(options?.body)),branchOfId:'org',interestAreas:[],branchOf:{id:'org',name:row.name,isActive:true}},{status:201}));
      if (path.includes('/branches')) return Promise.resolve(Response.json(page([])));
      if (path.includes('/people?')) return Promise.resolve(Response.json(page([])));
      if (path.includes('/contacts?')) return Promise.resolve(Response.json(page([])));
      if (path === 'organizations' && method === 'POST') {
        const input = JSON.parse(String(options?.body)) as { name: string };
        row = { ...base, ...input }; return Promise.resolve(Response.json(row, { status: 201 }));
      }
      if (path === 'organizations/org' && method === 'PUT') {
        if (conflicting) return Promise.resolve(Response.json({ code: 'VERSION_CONFLICT' }, { status: 409 }));
        const input = JSON.parse(String(options?.body)) as { name: string; description: string };
        row = { ...row, ...input, version: row.version + 1 }; return Promise.resolve(Response.json(row));
      }
      if (path === 'organizations/org/status' && method === 'PATCH') {
        const input = JSON.parse(String(options?.body)) as { isActive: boolean; expectedVersion: number };
        row = { ...row, isActive: input.isActive, version: row.version + 1 }; return Promise.resolve(Response.json(row));
      }
      if (path === 'organizations/org') return Promise.resolve(detailStatus === 404 ? Response.json({ code: 'NOT_FOUND', stack: 'internal detail' }, { status: 404 }) : Response.json(row));
      if (path.startsWith('organizations?')) {
        if (listState === 'pending') return new Promise<Response>(() => undefined);
        if (listState === 'error') return Promise.resolve(new Response(null, { status: 500 }));
        return Promise.resolve(Response.json(page(listState === 'empty' ? [] : [row], listState === 'empty' ? 0 : total)));
      }
      return Promise.reject(new Error('Ruta inesperada: ' + path));
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function app(path = '/organizations') {
    return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></QueryClientProvider>);
  }
  it('capability permite navegación y edición; estado reservado no aparece', async () => {
    app('/organizations/org'); await screen.findByRole('heading', { name: 'Institución QA' });
    expect(screen.getAllByRole('link', { name: 'Organizaciones' }).every(link => link.getAttribute('href') === '/organizations')).toBe(true);
    expect(screen.getByRole('button', { name: 'Editar ficha' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Desactivar organización' })).not.toBeInTheDocument();
  });
  it('Admin recibe cambio de estado por capability', async () => {
    current = { ...identity, role: 'ADMINISTRATOR', permissions: [...capabilities, 'directory.status.update'] };
    app('/organizations/org'); expect(await screen.findByRole('button', { name: 'Desactivar organización' })).toBeVisible();
  });
  it('explica y confirma la desactivación de organización antes de escribir', async () => {
    current = { ...identity, role: 'ADMINISTRATOR', permissions: [...capabilities, 'directory.status.update'] };
    const user = userEvent.setup(); app('/organizations/org');
    await user.click(await screen.findByRole('button', { name: 'Desactivar organización' }));
    expect(screen.getByText(/Sus datos y gestiones históricas se conservarán/)).toBeVisible();
    expect(fetchMock.mock.calls.some(([url, options]) => url.endsWith('/status') && options?.method === 'PATCH')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Confirmar desactivación' }));
    await screen.findByRole('button', { name: 'Reactivar organización' });
    const call = fetchMock.mock.calls.find(([url, options]) => url.endsWith('/status') && options?.method === 'PATCH');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ isActive: false, expectedVersion: 1 });
  });
  it('404 de ficha explica el problema y ofrece volver al directorio', async () => {
    detailStatus = 404; app('/organizations/org');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró la información solicitada.');
    expect(screen.getByRole('link', { name: 'Volver al directorio' })).toHaveAttribute('href', '/organizations');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    expect(screen.queryByText(/internal detail/)).not.toBeInTheDocument();
  });
  it('abre secciones por URL y carga datos de la sección activa', async () => {
    const user = userEvent.setup(); app('/organizations/org/contacts');
    await screen.findByRole('heading', { name: 'Contactos' });
    expect(screen.getByRole('link', { name: /^Contactos$/ })).toHaveAttribute('aria-current', 'page');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('/organizations/org/contacts?page=1&pageSize=10'))).toBe(true));
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/organizations/org/branches?'))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/organizations/org/people?'))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/organizations/org/history'))).toBe(false);

    await user.click(screen.getByRole('link', { name: /^Sedes$/ }));
    await screen.findByRole('heading', { name: 'Sedes y representaciones' });
    expect(screen.getByRole('link', { name: /^Sedes$/ })).toHaveAttribute('aria-current', 'page');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('/organizations/org/branches?status=all&page=1&pageSize=10'))).toBe(true));
  });
  it('resumen carga conteos con consultas pequeñas, sin traer historiales ni candidatos', async () => {
    app('/organizations/org');
    await screen.findByRole('heading', { name: 'Información institucional' });
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => url.includes('/organizations/org/people?status=all&page=1&pageSize=1'))).toBe(true);
      expect(fetchMock.mock.calls.some(([url]) => url.includes('/organizations/org/contacts?page=1&pageSize=1'))).toBe(true);
      expect(fetchMock.mock.calls.some(([url]) => url.includes('/organizations/org/branches?status=all&page=1&pageSize=1'))).toBe(true);
    });
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/organizations/org/history'))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/duplicate-candidates?'))).toBe(false);
  });
  it('sin capability no consulta ni muestra navegación', async () => {
    current = { ...identity, permissions: [] }; app();
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso');
    expect(screen.queryByRole('link', { name: 'Directorio' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/organizations'))).toBe(false);
  });
  it.each(['pending', 'error', 'empty'])('listado maneja %s', async state => {
    listState = state; app();
    if (state === 'pending') expect(await screen.findByText('Cargando organizaciones…')).toBeVisible();
    if (state === 'error') expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');
    if (state === 'empty') expect(await screen.findByText('No hay organizaciones registradas.')).toBeVisible();
  });
  it('crea ficha con solo nombre e invalida caché', async () => {
    const user = userEvent.setup(); withCategories = false; const invalidate = vi.spyOn(client, 'invalidateQueries');
    app('/organizations/new'); await user.type(await screen.findByLabelText('Nombre'), 'Nueva institución');
    await user.click(screen.getByRole('button', { name: 'Guardar organización' }));
    await screen.findByRole('heading', { name: 'Nueva institución' });
    const call = fetchMock.mock.calls.find(([url, options]) => url.endsWith('/organizations') && options?.method === 'POST');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ name: 'Nueva institución', branchOfId: null, interestAreas: [] });
    expect(JSON.parse(String(call?.[1]?.body))).not.toHaveProperty('lastVerifiedAt');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['directory', 'qa'] });
  });
  it('registra una sede con datos institucionales y la asocia a la organización actual', async () => {
    const user = userEvent.setup(); app('/organizations/org/locations');
    await user.click(await screen.findByRole('button', { name: 'Añadir sede o representación' }));
    expect(await screen.findByLabelText('Nombre')).toHaveValue(base.name);expect(screen.getByLabelText('Nombre')).toHaveAttribute('readonly');
    await user.type(screen.getByLabelText('Lugar de la sede'), 'La Paz, Bolivia');
    await user.type(screen.getByLabelText('Sitio oficial (opcional)'), 'https://sede.example.test');
    expect(screen.queryByLabelText('Área de interés')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Dato de contacto'),'sede@example.test');
    await user.click(screen.getByRole('button',{name:'Agregar otro medio'}));
    await user.type(within(screen.getByRole('group',{name:'Medio de contacto 2'})).getByLabelText('Dato de contacto'),'otra.sede@example.test');
    await user.click(screen.getByRole('button', { name: 'Guardar sede' }));
    await screen.findByRole('button', { name: 'Añadir sede o representación' });
    const call = fetchMock.mock.calls.find(([url, options]) => url.endsWith('/organizations/org/branches') && options?.method === 'POST');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ country: 'La Paz, Bolivia', officialWebsite: 'https://sede.example.test', contactMethods:[{type:'EMAIL',value:'sede@example.test',label:''},{type:'EMAIL',value:'otra.sede@example.test',label:''}] });
  });
  it('un correo ocupado conserva los datos y los contactos de la sede en el formulario',async()=>{
    branchFailure=true;const user=userEvent.setup();app('/organizations/org/locations');
    await user.click(await screen.findByRole('button',{name:'Añadir sede o representación'}));
    await user.type(screen.getByLabelText('Lugar de la sede'),'La Paz');await user.type(screen.getByLabelText('Dato de contacto'),'ocupado@example.test');
    await user.click(screen.getByRole('button',{name:'Guardar sede'}));expect(await screen.findByRole('alert')).toHaveTextContent('Este correo ya está registrado');
    expect(screen.getByLabelText('Nombre')).toHaveValue(base.name);expect(screen.getByLabelText('Dato de contacto')).toHaveValue('ocupado@example.test');
  });
  it('una sede exige su lugar antes de guardar y no permite editar el nombre automático',async()=>{
    const user=userEvent.setup();app('/organizations/org/locations');await user.click(await screen.findByRole('button',{name:'Añadir sede o representación'}));
    expect(screen.getByLabelText('Lugar de la sede')).toBeRequired();expect(screen.getByLabelText('Nombre')).toHaveAttribute('readonly');
    await user.click(screen.getByRole('button',{name:'Guardar sede'}));
    expect(fetchMock.mock.calls.some(([,options])=>options?.method==='POST')).toBe(false);
    await user.type(screen.getByLabelText('Lugar de la sede'),'   ');await user.click(screen.getByRole('button',{name:'Guardar sede'}));
    expect(await screen.findByText('Indica el lugar de la sede.')).toBeVisible();
  });
  it('edita la ficha de una sede y conserva su organización asociada sin áreas propias', async () => {
    row = { ...base, country:'La Paz', branchOfId: branchOwner.id, branchOf: branchOwner };
    const user = userEvent.setup(); app('/organizations/org');
    await user.click(await screen.findByRole('button', { name: 'Editar ficha' }));
    await user.type(screen.getByLabelText('Descripción (opcional)'), 'Descripción revisada');
    expect(screen.queryByLabelText('Área de interés')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar sede' }));
    await screen.findByRole('button', { name: 'Editar ficha' });
    const call = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ expectedVersion: 1, branchOfId: branchOwner.id, interestAreas: [], description: 'Descripción revisada' });
  });
  it('409 conserva borrador, no reintenta y recarga solo con advertencia visible', async () => {
    const user = userEvent.setup(); conflicting = true; app('/organizations/org');
    await user.click(await screen.findByRole('button', { name: 'Editar ficha' }));
    await user.type(screen.getByLabelText('Descripción (opcional)'), 'Mi borrador');
    row = { ...row, version: 2, description: 'Cambio ajeno' };
    await user.click(screen.getByRole('button', { name: 'Guardar organización' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Recargar descartará');
    expect(screen.getByLabelText('Descripción (opcional)')).toHaveValue('Mi borrador');
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Recargar ficha y descartar cambios' }));
    await waitFor(() => expect(screen.getByLabelText('Descripción (opcional)')).toHaveValue('Cambio ajeno'));
    conflicting = false; await user.click(screen.getByRole('button', { name: 'Guardar organización' }));
    await screen.findByRole('button', { name: 'Editar ficha' });
    const calls = fetchMock.mock.calls.filter(([, options]) => options?.method === 'PUT');
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toMatchObject({ expectedVersion: 2, description: 'Cambio ajeno' });
  });
  it('paginación solicita página backend y conserva límites', async () => {
    total = 26; const user = userEvent.setup(); app();
    await screen.findByRole('link', { name: 'Institución QA' });
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('page=2'))).toBe(true));
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });
  it('historial vacío, sede asociada y sedes registradas son visibles', async () => {
    current = { ...identity, role: 'ADMINISTRATOR' };
    row = { ...row, branchOfId: branchOwner.id, branchOf: branchOwner };
    const user = userEvent.setup(); app('/organizations/org/locations');
    await screen.findByRole('heading', { name: 'Institución QA' });
    expect(screen.getByRole('link', { name: 'Organización regional' })).toHaveAttribute('href', '/organizations/branch-owner');
    expect(await screen.findByText('No hay sedes o representaciones registradas.')).toBeVisible();
    await user.click(screen.getByRole('link', { name: /^Control$/ }));
    expect(await screen.findByText('Aún no hay modificaciones.')).toBeVisible();
  });

  it('historial muestra nombres de asociaciones y valores anteriores sin códigos técnicos', async () => {
    current = { ...identity, role: 'ADMINISTRATOR' }; showHistory = true; app('/organizations/org/control');
    await userEvent.click(await screen.findByText('Ver detalle del cambio'));
    expect(await screen.findByText('Después: Educación QA, Ambiente QA')).toBeVisible();
    expect(screen.getByText('Antes: Sin categorías')).toBeVisible();
    expect(screen.queryByText('operation-qa')).not.toBeInTheDocument();
  });
  it('logout limpia fichas y cambio de identidad/capabilities cancela y elimina caché', async () => {
    const user = userEvent.setup(); app('/organizations/org'); await screen.findByRole('heading', { name: 'Institución QA' });
    expect(client.getQueryData(['directory', 'qa', 'organization', 'org'])).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await screen.findByRole('heading', { name: 'Iniciar sesión' });
    expect(client.getQueriesData({ queryKey: ['directory'] })).toHaveLength(0);
    client.setQueryData(['directory', 'old', 'organizations', 'list'], page([row]));
    client.setQueryData(['directory', 'qa', 'history', 'history'], page([]));
    await act(async () => { await clearForbiddenDirectory(client, { ...identity, permissions: ['directory.read'] }); });
    expect(client.getQueriesData({ queryKey: ['directory'] })).toHaveLength(0);
    expect(client.getQueryData(AUTH_QUERY_KEY)).toBeNull();
  });
  it('añade áreas libres, evita duplicados y guarda también el texto pendiente', async () => {
    const user = userEvent.setup(); app('/organizations/new');
    await user.type(await screen.findByLabelText('Nombre'), 'Institución con áreas');
    const input = screen.getByLabelText('Área de interés');
    await user.type(input, ' Educación   ambiental ');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Quitar Educación ambiental' })).toBeVisible();
    await user.type(input, 'EDUCACIÓN AMBIENTAL');
    await user.click(screen.getByRole('button', { name: 'Añadir área de interés' }));
    expect(screen.getByText('Esta área ya está añadida.')).toBeVisible();
    await user.clear(input); await user.type(input, 'Salud comunitaria');
    await user.click(screen.getByRole('button', { name: 'Guardar organización' }));
    await screen.findByRole('heading', { name: 'Institución con áreas' });
    const call = fetchMock.mock.calls.find(([url, options]) => url.endsWith('/organizations') && options?.method === 'POST');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ interestAreas: ['Educación ambiental', 'Salud comunitaria'] });
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/categories'))).toBe(false);
  });
  it('quitar todas las áreas guarda el arreglo vacío en una edición', async () => {
    row = { ...base, interestAreas: ['Salud', 'Educación'] };
    const user = userEvent.setup(); app('/organizations/org');
    await user.click(await screen.findByRole('button', { name: 'Editar ficha' }));
    await user.click(screen.getByRole('button', { name: 'Quitar Salud' }));
    await user.click(screen.getByRole('button', { name: 'Quitar Educación' }));
    await user.click(screen.getByRole('button', { name: 'Guardar organización' }));
    await screen.findByRole('button', { name: 'Editar ficha' });
    const call = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ interestAreas: [], expectedVersion: 1 });
  });
  it('Zod valida nombre, sitio y opcionales sin completar datos desconocidos', () => {
    const blank = { name: '', country: '', alias: '', description: '', officialWebsite: '', branchOfId: '', interestAreas: [] };
    expect(organizationFormSchema.safeParse(blank).success).toBe(false);
    expect(organizationFormSchema.safeParse({ ...blank, name: ' Parcial  ' }).success).toBe(true);
    expect(organizationFormSchema.safeParse({ ...blank, name: 'Ficha', officialWebsite: 'javascript:alert(1)' }).success).toBe(false);
  });
});
