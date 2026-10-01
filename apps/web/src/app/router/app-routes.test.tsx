import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
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
  it('muestra la pantalla inicial sin depender de la API', () => {
    renderApplication('/');
    expect(screen.getByRole('heading', { name: 'CECASEM Conecta', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Sistema de Gestión de Relaciones Institucionales y Cooperación')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Aplicación base en funcionamiento' })).toBeVisible();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('permite volver al inicio desde una ruta inexistente', async () => {
    const user = userEvent.setup();
    renderApplication('/ruta-inexistente');
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Volver al inicio' }));
    expect(screen.getByRole('heading', { name: 'CECASEM Conecta', level: 1 })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Página no encontrada' })).not.toBeInTheDocument();
  });
});
