import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AUTHENTICATED_NAVIGATION, visibleNavigationItems } from '../router/navigation';
import { ApplicationFrame } from './application-frame';
import { ShellNavigation } from './shell-navigation';

describe('Shell institucional', () => {
  it('oculta grupos sin capabilities y conserva el contexto de comunicaciones', () => {
    const items = visibleNavigationItems(AUTHENTICATED_NAVIGATION, ['relationships.process.read']);
    render(<MemoryRouter><ShellNavigation items={items} pathname="/communications/fixture" /></MemoryRouter>);
    expect(screen.queryByRole('region', { name: 'Administración' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Personas externas' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Procesos' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Exportar Excel' })).toHaveAttribute('href', '/admin/exports');
  });
  it('permite abrir el menú nativo y conserva un único main', async () => {
    const items = visibleNavigationItems(AUTHENTICATED_NAVIGATION, ['directory.read']);
    render(<MemoryRouter><ApplicationFrame pathname="/people" context="Personas externas"
      navigation={<ShellNavigation items={items} pathname="/people" />}>
      <h1>Personas</h1>
    </ApplicationFrame></MemoryRouter>);
    const summary = screen.getByText('Menú principal');
    await userEvent.click(summary);
    const details = summary.closest('details')!;
    expect(details).toHaveAttribute('open');
    expect(within(details).getByRole('link', { name: 'Personas externas' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Ir al contenido' })).toHaveAttribute('href', '#contenido');
  });
});
