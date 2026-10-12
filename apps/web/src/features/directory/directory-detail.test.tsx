import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';

const stamp = '2026-10-07T00:00:00Z';
const category = { id: 'category', name: 'Educación', isActive: false, version: 1, createdAt: stamp, updatedAt: stamp };
const organization = { id: 'org', name: 'Institución de prueba', country: 'Bolivia', alias: 'IP', description: 'Información institucional real del contrato.', officialWebsite: null,
  isActive: true, version: 3, branchOfId: 'parent', branchOf: { id: 'parent', name: 'Sede principal de prueba', isActive: true }, categories: [category], createdAt: stamp, updatedAt: stamp, };
const person = { id: 'person', displayName: 'Ana Prueba', givenNames: 'Ana', familyNames: 'Prueba', isActive: true, version: 3, createdAt: stamp, updatedAt: stamp, currentRelationsCount: 1 };
const episode = { id: 'episode', personId: 'person', organizationId: 'org', person: { id: 'person', displayName: person.displayName, isActive: true },
  organization: { id: 'org', name: organization.name, isActive: true }, positionTitle: 'Coordinadora', area: 'Programas', isCurrent: true, startDate: null, endDate: null,
  sourceDescription: 'Fuente del episodio', sourceUrl: null, notes: 'Observación del episodio', version: 2, createdAt: stamp, updatedAt: stamp, };
const method = { id: 'method', type: 'EMAIL', value: 'correo.compartido@example.test', label: null, condition: 'USABLE', version: 1, createdAt: stamp, updatedAt: stamp, associationCount: 2 };
const association = { id: 'association', contactMethodId: 'method', sourceDescription: 'Fuente exclusiva de la asociación', sourceUrl: null, notes: 'No acredita comunicación',
  isActive: false, version: 1, createdAt: stamp, updatedAt: stamp, contactMethod: method };
const actor: AuthIdentity = { id: 'ui25', username: 'ui25', email: 'qa@example.test', givenNames: 'QA', familyNames: 'Ficha', role: 'ADMINISTRATOR',
  permissions: ['directory.read', 'directory.write', 'directory.status.update', 'directory.history.read'] };
const page = (items: unknown[]) => ({ items, total: items.length, page: 1, pageSize: 25 });

describe('UI 2.5 fichas institucionales', () => {
  let client = createQueryClient(), identity = actor, independent = false, consolidated = false;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); identity = actor; independent = false; consolidated = false;
    fetchMock.mockReset(); fetchMock.mockImplementation((url, options) => {
      const path = url.replace('/api/v1/', '');
      if (options?.method && options.method !== 'GET') return Promise.reject(new Error('Esta prueba no debe escribir datos.'));
      if (path === 'auth/me') return Promise.resolve(Response.json(identity));
      if (path.includes('/duplicate-candidates?')) return Promise.resolve(Response.json(page([])));
      if (path.includes('/history?')) return Promise.resolve(Response.json(page([{ operationId: 'operation', createdAt: stamp, objectType: 'PERSON', actor: { id: 'author', givenNames: 'Autora', familyNames: 'Histórica', isActive: false },
        contextRecorded: true, relatedReferences: [], replacement: null, changes: [{ field: 'displayName', label: 'Nombre de presentación', previousValue: 'Nombre anterior', newValue: person.displayName, previousReferences: [], newReferences: [], added: [], removed: [] }] }])));
      if (path.includes('/contacts?')) return Promise.resolve(Response.json(page([{ ...association, ...(path.startsWith('people/') ? { personId: person.id, person: episode.person } : { organizationId: organization.id, organization: episode.organization }) }])));
      if (path.includes('/relations?') || path.includes('/people?')) return Promise.resolve(Response.json(page(independent ? [] : [episode, { ...episode, id: 'past', positionTitle: 'Consultora', isCurrent: false, endDate: null }])));
      if (path.includes('/branches?')) return Promise.resolve(Response.json(page([{ ...organization, id: 'office', name: 'Sede de prueba', isActive: false }])));
      if (path === 'organizations/org') return Promise.resolve(Response.json({ ...organization, ...(consolidated ? { duplicateOfId: 'principal', duplicateOf: { id: 'principal', name: 'Principal de prueba' } } : {}) }));
      if (path === 'people/person') return Promise.resolve(Response.json({ ...person, currentRelationsCount: independent ? 0 : 1 }));
      return Promise.reject(new Error('Ruta no prevista: ' + path));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function view(kind: 'organizations' | 'people', section?: 'people' | 'contacts' | 'locations' | 'control') {
    client.setQueryData(AUTH_QUERY_KEY, identity); client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity });
    const basePath = `/${kind}/${kind === 'people' ? 'person' : 'org'}`;
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[section ? `${basePath}/${section}` : basePath]}><AppRoutes /></MemoryRouter></QueryClientProvider>);
  }
  it('UI 2.12 cancelar desactivación devuelve el foco sin cambiar estado ni escribir', async () => {
    view('organizations');
    const trigger = await screen.findByRole('button', { name: 'Desactivar organización' });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('button', { name: 'Volver sin cambiar estado' }));
    expect(screen.queryByRole('button', { name: 'Confirmar desactivación' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.getByText('Activa')).toBeVisible();
    expect(fetchMock.mock.calls.some(([, options]) => options?.method && options.method !== 'GET')).toBe(false);
  });
  it('organización conserva identidad, sede asociada, categorías inactivas y sede navegable', async () => {
    view('organizations'); expect(await screen.findByRole('heading', { level: 1, name: organization.name })).toBeVisible();
    const summary = within(screen.getByRole('region', { name: 'Información institucional' }));
    expect(summary.getByText('Bolivia')).toBeVisible(); expect(summary.getByText('Educación (inactiva)')).toBeVisible();
    expect(summary.getByRole('link', { name: 'Sede principal de prueba' })).toHaveAttribute('href', '/organizations/parent');
    await userEvent.click(screen.getByRole('link', { name: /^Sedes$/ }));
    expect(await screen.findByRole('link', { name: 'Sede de prueba' })).toHaveAttribute('href', '/organizations/office');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
  it.each(['organizations', 'people'] as const)('%s preserva contacto compartido, antecedente, condición y fuente por asociación', async kind => {
    view(kind, kind === 'organizations' ? 'contacts' : undefined); expect(await screen.findByRole('link', { name: method.value })).toHaveAttribute('href', '/contact-methods/method');
    expect(screen.getByText('Asociación inactiva / antecedente · Medio: Disponible')).toBeVisible();
    expect(screen.getByText('Medio compartido entre 2 asociaciones.')).toBeVisible();
    if (kind === 'organizations') await userEvent.click(screen.getByText('Ver detalles y acciones'));
    expect(await screen.findByText('Fuente: Fuente exclusiva de la asociación')).toBeVisible();
  });
  it('persona mantiene episodios actuales e históricos, cargos y fechas desconocidas', async () => {
    view('people'); await screen.findByText('Vigente · Cargo: Coordinadora');
    expect(screen.getByText('Histórico / finalizado · Cargo: Consultora')).toBeVisible();
    expect(screen.getByText('Período: Inicio desconocido → Fin desconocido')).toBeVisible();
    expect(screen.getAllByRole('link', { name: organization.name }).every(link => link.getAttribute('href') === '/organizations/org')).toBe(true);
  });
  it('persona independiente conserva contexto comprensible sin inventar cargo u organización', async () => {
    independent = true; view('people'); expect(await screen.findByText(/Sin vínculos vigentes: persona independiente/)).toBeVisible();
    expect(await screen.findByText('No hay vínculos en esta selección.')).toBeVisible(); expect(screen.queryByText('Vigente · Cargo: Coordinadora')).not.toBeInTheDocument();
  });
  it('historial de modificaciones preserva valores anteriores y posteriores y autor', async () => {
    view('people'); const history = await screen.findByRole('region', { name: 'Historial de modificaciones' });
    expect(await within(history).findByText('Antes: Nombre anterior')).toBeVisible(); expect(history).toHaveTextContent('Después: Ana Prueba'); expect(history).toHaveTextContent('Usuario actualmente desactivado');
  });
  it('ficha consolidada conserva destino e historia y bloquea mantenimiento del actor', async () => {
    consolidated = true; view('organizations', 'control'); expect(await screen.findByRole('link', { name: 'Principal de prueba' })).toHaveAttribute('href', '/organizations/principal');
    expect(screen.queryByRole('button', { name: 'Editar ficha' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Desactivar organización' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar medio de contacto' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Historial de modificaciones' })).toBeVisible();
  });
  it.each(['ADMINISTRATOR', 'RESEARCH', 'BOARD', 'PLANNING'] as const)('capabilities de lectura mantienen ficha completa sin mutaciones para %s', async role => {
    identity = { ...actor, role, permissions: ['directory.read', 'directory.history.read'] }; view('people'); await screen.findByRole('heading', { level: 1, name: person.displayName });
    await screen.findByRole('link', { name: method.value }); const main = within(screen.getByRole('main'));
    expect(main.queryByRole('button', { name: /Editar|Desactivar|Registrar|Corregir|Finalizar|Reactivar/u })).not.toBeInTheDocument();
    expect(main.getByRole('region', { name: 'Historial de modificaciones' })).toBeVisible();
  });
});
