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
  isActive: true, version: 3, parentId: 'parent', parent: { id: 'parent', name: 'Matriz de prueba', isActive: true }, categories: [category], createdAt: stamp, updatedAt: stamp, lastVerifiedAt: null };
const person = { id: 'person', displayName: 'Ana Prueba', givenNames: 'Ana', familyNames: 'Prueba', isActive: true, version: 3, createdAt: stamp, updatedAt: stamp, lastVerifiedAt: null, currentRelationsCount: 1 };
const episode = { id: 'episode', personId: 'person', organizationId: 'org', person: { id: 'person', displayName: person.displayName, isActive: true },
  organization: { id: 'org', name: organization.name, isActive: true }, positionTitle: 'Coordinadora', area: 'Programas', isCurrent: true, startDate: null, endDate: null,
  sourceDescription: 'Fuente del episodio', sourceUrl: null, notes: 'Observación del episodio', version: 2, createdAt: stamp, updatedAt: stamp, lastVerifiedAt: null };
const method = { id: 'method', type: 'EMAIL', value: 'correo.compartido@example.test', label: null, condition: 'USABLE', version: 1, createdAt: stamp, updatedAt: stamp, associationCount: 2 };
const association = { id: 'association', contactMethodId: 'method', sourceDescription: 'Fuente exclusiva de la asociación', sourceUrl: null, notes: 'No acredita comunicación',
  isActive: false, version: 1, createdAt: stamp, updatedAt: stamp, lastVerifiedAt: null, contactMethod: method };
const actor: AuthIdentity = { id: 'ui25', username: 'ui25', email: 'qa@example.test', givenNames: 'QA', familyNames: 'Ficha', role: 'ADMINISTRATOR',
  permissions: ['directory.read', 'directory.write', 'directory.status.update', 'directory.verify', 'directory.history.read'] };
const page = (items: unknown[]) => ({ items, total: items.length, page: 1, pageSize: 25 });

describe('UI 2.5 fichas institucionales', () => {
  let client = createQueryClient(), identity = actor, independent = false, consolidated = false, due = false;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); identity = actor; independent = false; consolidated = false; due = false;
    fetchMock.mockReset(); fetchMock.mockImplementation((url, options) => {
      const path = url.replace('/api/v1/', '');
      if (options?.method && options.method !== 'GET') return Promise.reject(new Error('Esta prueba no debe escribir datos.'));
      if (path === 'auth/me') return Promise.resolve(Response.json(identity));
      if (path.endsWith('/verification')) return Promise.resolve(Response.json({ objectType: 'person', classification: 'personal', intervalMonths: 6,
        verificationStatus: due ? 'REVIEW_DUE' : 'NEVER_VERIFIED', lastVerifiedAt: due ? stamp : null,
        lastVerifiedBy: due ? { id: 'author', givenNames: 'Autora', familyNames: 'Histórica', isActive: false } : null,
        nextReviewAt: due ? stamp : null, changedSinceVerification: due, timeReviewDue: due, version: 3, contactValueVersion: null }));
      if (path.includes('/verifications?')) return Promise.resolve(Response.json(page([{ id: 'verification', objectType: 'person', verifiedAt: stamp,
        actor: { id: 'author', givenNames: 'Autora', familyNames: 'Histórica', isActive: false }, sourceDescription: 'Evidencia preservada', sourceUrl: null }])));
      if (path.includes('/duplicate-candidates?')) return Promise.resolve(Response.json(page([])));
      if (path.includes('/history?')) return Promise.resolve(Response.json(page([{ operationId: 'operation', createdAt: stamp, objectType: 'PERSON', actor: { id: 'author', givenNames: 'Autora', familyNames: 'Histórica', isActive: false },
        contextRecorded: true, relatedReferences: [], replacement: null, changes: [{ field: 'displayName', label: 'Nombre de presentación', previousValue: 'Nombre anterior', newValue: person.displayName, previousReferences: [], newReferences: [], added: [], removed: [] }] }])));
      if (path.includes('/contacts?')) return Promise.resolve(Response.json(page([{ ...association, ...(path.startsWith('people/') ? { personId: person.id, person: episode.person } : { organizationId: organization.id, organization: episode.organization }) }])));
      if (path.includes('/relations?') || path.includes('/people?')) return Promise.resolve(Response.json(page(independent ? [] : [episode, { ...episode, id: 'past', positionTitle: 'Consultora', isCurrent: false, endDate: null }])));
      if (path.includes('/children?')) return Promise.resolve(Response.json(page([{ ...organization, id: 'office', name: 'Sede de prueba', isActive: false }])));
      if (path === 'organizations/org') return Promise.resolve(Response.json({ ...organization, ...(consolidated ? { duplicateOfId: 'principal', duplicateOf: { id: 'principal', name: 'Principal de prueba' } } : {}) }));
      if (path === 'people/person') return Promise.resolve(Response.json({ ...person, currentRelationsCount: independent ? 0 : 1 }));
      return Promise.reject(new Error('Ruta no prevista: ' + path));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function view(kind: 'organizations' | 'people') {
    client.setQueryData(AUTH_QUERY_KEY, identity); client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/${kind}/${kind === 'people' ? 'person' : 'org'}`]}><AppRoutes /></MemoryRouter></QueryClientProvider>);
  }
  it('organización conserva identidad, matriz, categorías inactivas y sede navegable', async () => {
    view('organizations'); expect(await screen.findByRole('heading', { level: 1, name: organization.name })).toBeVisible();
    const summary = within(screen.getByRole('region', { name: 'Información institucional' }));
    expect(summary.getByText('Bolivia')).toBeVisible(); expect(summary.getByText('Educación (inactiva)')).toBeVisible();
    expect(summary.getByRole('link', { name: 'Matriz de prueba' })).toHaveAttribute('href', '/organizations/parent');
    expect(await screen.findByRole('link', { name: 'Sede de prueba' })).toHaveAttribute('href', '/organizations/office');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
  it.each(['organizations', 'people'] as const)('%s preserva contacto compartido, antecedente, condición y fuente por asociación', async kind => {
    view(kind); expect(await screen.findByRole('link', { name: method.value })).toHaveAttribute('href', '/contact-methods/method');
    expect(screen.getByText('Asociación inactiva / antecedente · Medio: Disponible')).toBeVisible();
    expect(screen.getByText('Medio compartido entre 2 asociaciones.')).toBeVisible(); expect(screen.getByText('Fuente: Fuente exclusiva de la asociación')).toBeVisible();
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
  it('verificación pendiente preserva autor desactivado, intervalo y causas del servidor', async () => {
    due = true; view('people'); const panel = await screen.findByRole('region', { name: 'Verificación de persona Ana Prueba' });
    expect(await within(panel).findByText('Revisión pendiente')).toBeVisible(); expect(panel).toHaveTextContent('Autora Histórica · Usuario actualmente desactivado');
    expect(panel).toHaveTextContent('Intervalo: 6 meses calendario.'); expect(panel).toHaveTextContent('Hubo cambios posteriores'); expect(panel).toHaveTextContent('Venció el intervalo');
  });
  it('historial de verificación abre evidencia sin confundirla con modificaciones', async () => {
    view('people'); await userEvent.click(await screen.findByRole('button', { name: 'Ver historial de verificaciones: persona Ana Prueba' }));
    expect(await screen.findByText('Fuente: Evidencia preservada')).toBeVisible(); expect(screen.getByRole('button', { name: 'Ocultar historial de verificaciones: persona Ana Prueba' })).toHaveAttribute('aria-expanded', 'true');
  });
  it('historial de modificaciones preserva valores anteriores y posteriores y autor', async () => {
    view('people'); const history = await screen.findByRole('region', { name: 'Historial de modificaciones' });
    expect(await within(history).findByText('Antes: Nombre anterior')).toBeVisible(); expect(history).toHaveTextContent('Después: Ana Prueba'); expect(history).toHaveTextContent('Usuario actualmente desactivado');
  });
  it('ficha consolidada conserva destino e historia y bloquea mantenimiento del actor', async () => {
    consolidated = true; view('organizations'); expect(await screen.findByRole('link', { name: 'Principal de prueba' })).toHaveAttribute('href', '/organizations/principal');
    expect(screen.queryByRole('button', { name: 'Editar ficha' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Desactivar organización' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar medio de contacto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar verificado: organización Institución de prueba' })).not.toBeInTheDocument(); expect(screen.getByRole('region', { name: 'Historial de modificaciones' })).toBeVisible();
  });
  it.each(['ADMINISTRATOR', 'RESEARCH', 'BOARD', 'PLANNING'] as const)('capabilities de lectura mantienen ficha completa sin mutaciones para %s', async role => {
    identity = { ...actor, role, permissions: ['directory.read', 'directory.history.read'] }; view('people'); await screen.findByRole('heading', { level: 1, name: person.displayName });
    await screen.findByRole('link', { name: method.value }); const main = within(screen.getByRole('main'));
    expect(main.queryByRole('button', { name: /Editar|Desactivar|Marcar verificado|Registrar|Corregir|Finalizar|Reactivar/u })).not.toBeInTheDocument();
    expect(main.getByRole('button', { name: 'Ver historial de verificaciones: persona Ana Prueba' })).toBeVisible(); expect(main.getByRole('region', { name: 'Historial de modificaciones' })).toBeVisible();
  });
  it('verificar abre evidencia y cancelar no envía una mutación', async () => {
    view('people'); await userEvent.click(await screen.findByRole('button', { name: 'Marcar verificado: persona Ana Prueba' }));
    expect(screen.getByRole('form', { name: 'Corroborar persona Ana Prueba' })).toBeVisible();
    expect(screen.getByLabelText('Fuente de corroboración (opcional)')).toBeVisible(); await userEvent.click(screen.getByRole('button', { name: 'Cancelar verificación' }));
    expect(screen.queryByRole('form', { name: 'Corroborar persona Ana Prueba' })).not.toBeInTheDocument(); expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });
  it('verificación embebida conserva validación de URL y asociación accesible del error', async () => {
    view('people'); await userEvent.click(await screen.findByRole('button', { name: 'Marcar verificado: persona Ana Prueba' }));
    await userEvent.type(screen.getByLabelText('URL de corroboración (opcional)'), 'valor inválido'); await userEvent.click(screen.getByRole('button', { name: 'Confirmar verificación' }));
    expect(screen.getByLabelText('URL de corroboración (opcional)')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('URL de corroboración (opcional)')).toHaveAttribute('aria-describedby');
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });
  it('confirmar evidencia usa el submit original, objeto y versión esperada', async () => {
    const read = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, options) => options?.method === 'POST' ? Promise.resolve(Response.json({})) : read(url, options));
    view('people'); await userEvent.click(await screen.findByRole('button', { name: 'Marcar verificado: persona Ana Prueba' }));
    await userEvent.type(screen.getByLabelText('Fuente de corroboración (opcional)'), 'Fuente corroborada');
    await userEvent.click(screen.getByRole('checkbox', { name: 'He corroborado la información de este objeto.' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar verificación' }));
    await screen.findByRole('button', { name: 'Marcar verificado: persona Ana Prueba' });
    const write = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(write?.[0]).toBe('/api/v1/people/person/verify');
    expect(JSON.parse(String(write?.[1]?.body))).toEqual({ expectedVersion: 3, sourceDescription: 'Fuente corroborada', sourceUrl: null });
  });
});
