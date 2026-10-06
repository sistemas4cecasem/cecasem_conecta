import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '../providers/app-providers';
import { AppRoutes } from './app-routes';

function renderApplication(path: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>
    </AppProviders>,
  );
}

describe('Aplicación base', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => Promise.resolve(url.endsWith('/dashboard') ? Response.json({ view: 'research', asOf: '2026-10-05T12:00:00Z', activeProcesses: 0, relevantProcesses: [], activeIntents: 0, relevantIntents: [], unreadReminders: 0, reminderItems: [] }) : Response.json({
      id: 'fixture', givenNames: 'Ana', familyNames: 'Prueba', username: 'ana.prueba', email: 'fixture@example.test', role: 'RESEARCH', permissions: ['relationships.process.read'],
    }))));
  });
  it('muestra la pantalla inicial después de comprobar la sesión', async () => {
    renderApplication('/');
    expect(await screen.findByRole('heading', { name: 'Panel institucional', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Procesos activos relevantes')).toBeVisible();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('permite volver al inicio desde una ruta inexistente', async () => {
    const user = userEvent.setup();
    renderApplication('/ruta-inexistente');
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Volver al inicio' }));
    expect(await screen.findByRole('heading', { name: 'Panel institucional', level: 1 })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Página no encontrada' })).not.toBeInTheDocument();
  });
});
