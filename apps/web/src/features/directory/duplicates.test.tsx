import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { AppRoutes } from '../../app/router/app-routes';
import { DuplicatePanel } from './duplicate-panel';
import { ConsolidationProvenance } from './consolidation-provenance';
import { DirectoryHistory } from './directory-history';
import { clearForbiddenDirectory } from './queries';
import type { ConsolidationPreview, DuplicateCandidate } from './duplicates.contracts';

const aId = '11111111-1111-4111-8111-111111111111', bId = '22222222-2222-4222-8222-222222222222', id = '33333333-3333-4333-8333-333333333333';
const stamp = '2026-10-02T12:00:00.000Z';
const reader: AuthIdentity = { id: 'reader', givenNames: 'Autora', familyNames: 'QA', username: 'reader', email: 'reader@example.test', role: 'RESEARCH',
  permissions: ['directory.read', 'directory.write', 'directory.history.read', 'directory.verify', 'directory.duplicates.dismiss'] };
const actor = { id: aId, name: 'Fundación Esperanza', alias: null, country: 'Bolivia', parentId: null, parent: null, version: 1, duplicateOfId: null,
  isActive: true, lastVerifiedAt: null };
const candidate: DuplicateCandidate = { id, kind: 'organization', a: actor, b: { ...actor, id: bId, name: 'Fundacion Esperanza' }, score: 1,
  signals: ['SIMILAR_ORGANIZATION_NAMES', 'REVIEW_PARENT_OFFICE_CONTEXT'], state: 'PENDING', version: 1, examinedVersionA: 1, examinedVersionB: 1,
  detectedAt: stamp, stale: false, resolvedAt: null, resolvedBy: null, principalId: null };
const previewActor = { ...actor, label: actor.name, officialWebsite: 'https://example.test', children: [], categories: [], contacts: [], relations: [], verifications: [] };
describe('Revisión humana de candidatos y consolidación', () => {
  let client = createQueryClient(), identity = reader, candidates: DuplicateCandidate[] = [], mode = 'ok', principal = '', loggedOut = false;
  let preview: ConsolidationPreview;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); identity = { ...reader }; candidates = [{ ...candidate }]; mode = 'ok'; principal = ''; loggedOut = false;
    preview = { candidate, principal: previewActor, duplicate: { ...previewActor, id: bId, name: candidate.b.name, label: candidate.b.name! },
      previewToken: 'a'.repeat(64), blockers: [], effects: ['Se conservan fichas, fuentes, historial y verificaciones.'], contacts: [], relations: [], categories: [] };
    fetchMock.mockReset(); fetchMock.mockImplementation((url) => {
      const path = url.replace('/api/v1/', ''), route = path.split('?')[0];
      if (route === 'auth/me') return Promise.resolve(Response.json(loggedOut ? {} : identity, { status: loggedOut ? 401 : 200 }));
      if (route === 'auth/logout') { loggedOut = true; return Promise.resolve(new Response(null, { status: 204 })); }
      if (route?.endsWith('/duplicate-candidates')) {
        if (mode === 'pending') return new Promise<Response>(() => undefined);
        if (mode === 'listError') return Promise.resolve(new Response(null, { status: 500 }));
        return Promise.resolve(Response.json({ items: candidates, total: candidates.length, page: 1, pageSize: 25 }));
      }
      if (route?.endsWith('/dismiss')) {
        if (mode === 'dismissConflict') return Promise.resolve(Response.json({ code: 'DUPLICATE_CANDIDATE_STALE' }, { status: 409 }));
        candidates = candidates.map(row => ({ ...row, state: 'NOT_DUPLICATE', resolvedAt: stamp, resolvedBy: { id: identity.id,
          givenNames: identity.givenNames, familyNames: identity.familyNames, isActive: true }, version: 2 }));
        return Promise.resolve(Response.json(candidates[0]));
      }
      if (route?.endsWith('/consolidation-preview')) {
        if (mode === 'previewError') return Promise.resolve(new Response(null, { status: 500 }));
        if (mode === 'previewPending') return new Promise<Response>(() => undefined);
        principal = new URL(url, 'https://local.test').searchParams.get('principalId')!;
        return Promise.resolve(Response.json(principal === aId ? preview : { ...preview, principal: preview.duplicate, duplicate: preview.principal }));
      }
      if (route?.endsWith('/consolidate')) {
        if (mode === 'consolidationConflict') return Promise.resolve(Response.json({ code: 'CONSOLIDATION_VERSION_CONFLICT' }, { status: 409 }));
        if (mode === 'consolidationForbidden') return Promise.resolve(new Response(null, { status: 403 }));
        candidates = candidates.map(row => ({ ...row, state: 'CONSOLIDATED', principalId: principal, version: 2, resolvedAt: stamp, resolvedBy: null }));
        return Promise.resolve(Response.json({ principalId: principal }));
      }
      if (route === 'organizations/' + bId) return Promise.resolve(Response.json({ ...candidate.b, description: null, officialWebsite: null,
        createdAt: stamp, updatedAt: stamp, categories: [], duplicateOfId: aId, duplicateOf: { id: aId, name: actor.name }, consolidatedRecords: [] }));
      if (route?.endsWith('/verification')) return Promise.resolve(Response.json({ objectType: 'organization', classification: 'institutional', intervalMonths: 12,
        verificationStatus: 'NEVER_VERIFIED', lastVerifiedAt: null, lastVerifiedBy: null, nextReviewAt: null, changedSinceVerification: false,
        timeReviewDue: false, version: 2, contactValueVersion: null }));
      if (/\/(history|verifications|children|contacts|people)$/.test(route ?? '')) return Promise.resolve(Response.json({ items: [], total: 0, page: 1, pageSize: 25 }));
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function view(full = false) {
    if (full) client.setQueryData(AUTH_QUERY_KEY, identity);
    return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/organizations/' + bId]}>
      {full ? <AppRoutes /> : <DuplicatePanel identity={identity} actorPath={'organizations/' + bId} />}
    </MemoryRouter></QueryClientProvider>);
  }
  async function adminPreview(chosen = aId) {
    identity = { ...reader, role: 'ADMINISTRATOR', permissions: [...reader.permissions, 'directory.duplicates.manage'] }; view();
    const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: 'Revisar consolidación' }));
    await user.selectOptions(screen.getByLabelText('Registro principal'), chosen); await user.click(screen.getByRole('button', { name: 'Obtener vista previa' }));
    await screen.findByText(/Efectos que debes revisar/); return user;
  }
  async function confirm(user: ReturnType<typeof userEvent.setup>) {
    for (const checkbox of screen.getAllByRole('checkbox')) await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Confirmar consolidación' }));
  }
  it('no hay candidatos: estado vacío explícito', async () => { candidates = []; view(); expect(await screen.findByText(/No hay coincidencias pendientes/)).toBeInTheDocument(); });
  it('personas similares se comparan sin presentar identidad confirmada', async () => {
    candidates = [{ ...candidate, kind:'person',signals:['SIMILAR_PERSON_NAMES','COMPATIBLE_INITIALS'],
      a:{...actor,name:undefined,displayName:'María Fernanda Pérez',givenNames:'María Fernanda',familyNames:'Pérez'},
      b:{...actor,id:bId,name:undefined,displayName:'Maria F. Perez',givenNames:'Maria F.',familyNames:'Perez'} }];
    view(); await userEvent.setup().click(await screen.findByRole('button',{name:'Comparar fichas'}));
    expect(screen.getByRole('link',{name:'María Fernanda Pérez'})).toHaveAttribute('href','/people/'+aId);
    expect(screen.getByText(/Iniciales compatibles/)).toBeInTheDocument();
  });
  it('la procedencia operativa enlaza evidencia original sin copiar su verificación', () => {
    render(<MemoryRouter><ConsolidationProvenance origins={[{source:{id:'source',path:'organizations/'+bId,label:'Fundacion Esperanza'},
      outcome:'CREATED',sourceVersion:1,targetVersion:1,resolvedAt:stamp,resolvedBy:{id:'admin',givenNames:'Ana',familyNames:'QA',isActive:true}}]}/></MemoryRouter>);
    expect(screen.getByRole('link',{name:/Consultar evidencia original:/})).toHaveAttribute('href','/organizations/'+bId);
    expect(screen.getByText(/verificaciones originales permanecen/)).toBeInTheDocument();
  });
  it('historial de consolidación identifica fichas y principal sin confundirlo con sustitución de correo', async () => {
    fetchMock.mockResolvedValue(Response.json({ page: 1, pageSize: 25, total: 1, items: [{ operationId: id, objectType: 'ORGANIZATION',
      createdAt: stamp, actor: { id: reader.id, givenNames: reader.givenNames, familyNames: reader.familyNames, isActive: true },
      relatedReferences: [], contextRecorded: true,
      replacement: { previous: { id: bId, kind: 'organization', label: 'Fundacion Esperanza' }, next: { id: aId, kind: 'organization', label: 'Fundación Esperanza' } },
      changes: [{ field: 'duplicateOfOrganizationId', label: 'Consolidado en organización', previousValue: null, newValue: aId,
        previousReferences: [], newReferences: [{ id: aId, kind: 'organization', label: 'Fundación Esperanza' }], added: [], removed: [] }] }] }));
    render(<QueryClientProvider client={client}><DirectoryHistory identity={reader} path={'organizations/' + bId + '/history'} /></QueryClientProvider>);
    expect(await screen.findByRole('heading', { name: /Consolidación de fichas/ })).toBeInTheDocument();
    expect(screen.getByText('Ficha original: Fundacion Esperanza · Principal: Fundación Esperanza')).toBeInTheDocument();
    expect(screen.queryByText(/Canal anterior:/)).not.toBeInTheDocument();
  });
  it('muestra loading sin afirmar identidad', async () => { mode = 'pending'; view(); expect(await screen.findByRole('status')).toHaveTextContent('Cargando'); });
  it('error de lista permite reintentar', async () => {
    mode = 'listError'; view(); await screen.findByRole('alert'); mode = 'ok'; await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/Posible coincidencia:/)).toBeInTheDocument();
  });
  it('presenta advertencia y contexto matriz/sede, sin afirmar duplicado', async () => {
    view(); expect(await screen.findByText(/Posible coincidencia:/)).toBeInTheDocument(); expect(screen.getByText(/Revisar matriz y sede/)).toBeInTheDocument();
    expect(screen.queryByText('Duplicado detectado')).not.toBeInTheDocument();
  });
  it('comparar conserva nombres originales, contexto y enlaces a ambas fichas', async () => {
    view(); await userEvent.setup().click(await screen.findByRole('button', { name: 'Comparar fichas' }));
    expect(screen.getByRole('link', { name: 'Fundación Esperanza' })).toHaveAttribute('href', '/organizations/' + aId);
    expect(screen.getByRole('link', { name: 'Fundacion Esperanza' })).toHaveAttribute('href', '/organizations/' + bId);
    expect(screen.getAllByText('País: Bolivia')).toHaveLength(2);
  });
  it.each(['BOARD', 'RESEARCH', 'PLANNING'] as const)('%s puede descartar y no ve consolidación', async role => {
    identity = { ...reader, role }; view(); await userEvent.setup().click(await screen.findByRole('button', { name: 'No son duplicados' }));
    expect(await screen.findByText(/No hay coincidencias pendientes/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revisar consolidación' })).not.toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/dismiss'))!;
    expect(JSON.parse(call[1]?.body as string)).toEqual({ expectedCandidateVersion: 1, expectedVersionA: 1, expectedVersionB: 1 });
  });
  it('descarte invalida consultas de directorio y conserva decisión visible', async () => {
    view(); await userEvent.setup().click(await screen.findByRole('button', { name: 'No son duplicados' }));
    await screen.findByText(/No hay coincidencias pendientes/); await userEvent.setup().click(screen.getByText('Decisiones anteriores'));
    expect(screen.getByText(/Versiones examinadas 1\/1/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('/duplicate-candidates?')).length).toBeGreaterThan(1);
  });
  it('stale exige reevaluar antes de descartar o consolidar', async () => {
    candidates = [{ ...candidate, stale: true }]; identity = { ...reader, permissions: [...reader.permissions, 'directory.duplicates.manage'] }; view();
    expect(await screen.findByText(/Esta coincidencia está desactualizada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No son duplicados' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Revisar consolidación' })).toBeDisabled();
    candidates = [candidate]; await userEvent.setup().click(screen.getByRole('button', { name: 'Reevaluar coincidencias' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'No son duplicados' })).toBeEnabled());
  });
  it('conflicto de descarte ofrece recarga explícita', async () => {
    mode = 'dismissConflict'; view(); await userEvent.setup().click(await screen.findByRole('button', { name: 'No son duplicados' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Reevalúa/); expect(screen.getByRole('button', { name: 'Recargar y revisar coincidencia' })).toBeEnabled();
  });
  it('administración debe elegir principal; no hay selección automática', async () => {
    identity = { ...reader, permissions: [...reader.permissions, 'directory.duplicates.manage'] }; view();
    const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: 'Revisar consolidación' }));
    expect(screen.getByLabelText('Registro principal')).toHaveValue(''); await user.click(screen.getByRole('button', { name: 'Obtener vista previa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Elige explícitamente/);
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/consolidation-preview'))).toBe(false);
  });
  it.each([aId, bId])('principal elegido explícitamente %s determina la vista previa', async chosen => {
    await adminPreview(chosen); expect(principal).toBe(chosen);
    expect(screen.getByRole('heading', { name: 'Principal: ' + (chosen === aId ? actor.name : candidate.b.name) })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Duplicado:/ })).toBeInTheDocument();
  });
  it('confirmación requiere tres decisiones y no consolida con una pulsación', async () => {
    const user = await adminPreview(); await user.click(screen.getByRole('button', { name: 'Confirmar consolidación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/confirma los tres puntos/);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/consolidate'))).toBe(false);
    await confirm(user); await screen.findByText(/No hay coincidencias pendientes/);
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/consolidate'))!;
    expect(JSON.parse(call[1]?.body as string)).toMatchObject({ principalId: aId, expectedCandidateVersion: 1, expectedVersionA: 1, expectedVersionB: 1,
      confirmed: true, reconcileCurrentRelations: true, contactConflictPolicy: 'KEEP_PRINCIPAL_CONTEXT', previewToken: 'a'.repeat(64) });
  });
  it('matriz/sede y cadena bloquean confirmación administrativa', async () => {
    preview.blockers = ['CONSOLIDATION_HIERARCHY_CONFLICT']; await adminPreview();
    expect(screen.getByRole('alert')).toHaveTextContent(/matriz\/sede/); expect(screen.getByRole('button', { name: 'Confirmar consolidación' })).toBeDisabled();
  });
  it('conflictos de contexto y reactivación se explican antes de confirmar', async () => {
    preview.contacts = [{ sourceId: 'contact', targetId: 'target', value: 'contacto@example.test', outcome: 'KEPT_PRINCIPAL', contextConflict: true,
      reactivate: true, sourceContext: { sourceDescription: 'Otra fuente', sourceUrl: null, notes: 'Evidencia original' },
      principalContext: { sourceDescription: 'Principal', sourceUrl: null, notes: null } }];
    await adminPreview(); expect(screen.getByText(/Conflicto de contexto: se conserva/)).toBeInTheDocument();
    expect(screen.getByText(/Se reactivará la asociación/)).toBeInTheDocument();
  });
  it.each([true, false])('preview conserva fechas civiles y fin desconocido del episodio vigente=%s', async isCurrent => {
    preview.duplicate.relations = [{ id: 'episode', isCurrent, positionTitle: 'Coordinadora', area: null,
      startDate: '2020-01-01T00:00:00.000Z', endDate: null, lastVerifiedAt: null,
      sourceDescription: 'Evidencia original', sourceUrl: null, notes: null,
      person: { id: 'person', displayName: 'María' }, organization: { id: bId, name: 'Fundación' } }];
    await adminPreview();
    expect(screen.getByText((isCurrent ? 'Vigente' : 'Histórico') + ' · 2020-01-01 → ' + (isCurrent ? 'Actualidad' : 'Fecha final desconocida') + '.')).toBeInTheDocument();
    expect(screen.queryByText(/31\/12\/2019/)).not.toBeInTheDocument();
  });
  it('409 de consolidación conserva preview y obliga revisar de nuevo', async () => {
    const user = await adminPreview(); mode = 'consolidationConflict'; await confirm(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(/La vista previa cambió/);
    expect(screen.getByRole('heading', { name: /^Principal:/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Recargar y revisar coincidencia' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true);
  });
  it('403 del backend se refleja aun si la interfaz recibió capability', async () => {
    const user = await adminPreview(); mode = 'consolidationForbidden'; await confirm(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(/No tienes permiso/);
  });
  it('error de preview permite reintentar sin enviar consolidación', async () => {
    identity = { ...reader, permissions: [...reader.permissions, 'directory.duplicates.manage'] }; mode = 'previewError'; view();
    const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: 'Revisar consolidación' }));
    await user.selectOptions(screen.getByLabelText('Registro principal'), aId); await user.click(screen.getByRole('button', { name: 'Obtener vista previa' }));
    await screen.findByRole('alert'); mode = 'ok'; await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/Efectos que debes revisar/)).toBeInTheDocument();
  });
  it('ficha consolidada mantiene historial y enlace al principal, sin escrituras ordinarias', async () => {
    candidates = [{ ...candidate, state: 'CONSOLIDATED', principalId: aId, resolvedAt: stamp }]; view(true);
    const banner = await screen.findByText(/Este registro fue consolidado en:/);
    expect(within(banner).getByRole('link', { name: actor.name })).toHaveAttribute('href', '/organizations/' + aId);
    expect(screen.queryByRole('button', { name: 'Editar ficha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar medio de contacto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Marcar verificado:/ })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Historial de modificaciones' })).toBeInTheDocument();
  });
  it('cambio de identidad o pérdida de manage elimina preview administrativa de caché', async () => {
    client.setQueryData(['directory', reader.id, 'duplicates', 'organizations/' + bId], { items: [candidate] });
    client.setQueryData(['directory', reader.id, 'duplicate-preview', id, aId], preview);
    await clearForbiddenDirectory(client, reader);
    expect(client.getQueryData(['directory', reader.id, 'duplicate-preview', id, aId])).toBeUndefined();
    expect(client.getQueryData(['directory', reader.id, 'duplicates', 'organizations/' + bId])).toBeDefined();
    await clearForbiddenDirectory(client, null); expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
  it('logout cancela y elimina candidatos y preview guardados en la sesión', async () => {
    view(true); await screen.findByText(/Este registro fue consolidado en:/);
    client.setQueryData(['directory', reader.id, 'duplicate-preview', id, aId], preview);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await screen.findByRole('heading', { name: 'Iniciar sesión' });
    expect(client.getQueryCache().getAll().some(query => query.queryKey[0] === 'directory')).toBe(false);
  });
});
