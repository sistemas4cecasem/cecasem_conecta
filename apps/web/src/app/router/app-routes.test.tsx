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
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(Response.json({
      id: 'fixture', givenNames: 'Ana', familyNames: 'Prueba', username: 'ana.prueba', email: 'fixture@example.test', role: 'RESEARCH', permissions: [],
    }))));
  });
  it('muestra la pantalla inicial después de comprobar la sesión', async () => {
    renderApplication('/');
    expect(await screen.findByRole('heading', { name: 'CECASEM Conecta', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Sistema de Gestión de Relaciones Institucionales y Cooperación')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Aplicación base en funcionamiento' })).toBeVisible();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('permite volver al inicio desde una ruta inexistente', async () => {
    const user = userEvent.setup();
    renderApplication('/ruta-inexistente');
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Volver al inicio' }));
    expect(await screen.findByRole('heading', { name: 'CECASEM Conecta', level: 1 })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Página no encontrada' })).not.toBeInTheDocument();
  });
});
