import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { MetricCard } from './metric-card';
import { QueryFeedback, StatusBadge } from './feedback';

describe('Métricas compartidas', () => {
  it('conserva el destino y filtros como enlace semántico', () => {
    render(<MemoryRouter><MetricCard label="Esperando respuesta" value={3} to="/relationship-processes?state=WAITING_RESPONSE" /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Esperando respuesta 3' })).toHaveAttribute('href', '/relationship-processes?state=WAITING_RESPONSE');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('no inventa interacción cuando no hay destino', () => {
    render(<MetricCard label="Total" value={0} />);
    expect(screen.getByText('0')).toBeVisible(); expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('conserva descripción y contexto textual', () => {
    render(<MetricCard label="Revisión" value={2} description="Información institucional" context={<StatusBadge tone="warning">Requiere atención</StatusBadge>} />);
    expect(screen.getByText('Información institucional')).toBeVisible(); expect(screen.getByText('Requiere atención')).toBeVisible();
  });
  it('acepta valores de presentación sin calcular datos', () => {
    render(<MetricCard label="Resumen" value="Sin datos" />); expect(screen.getByText('Sin datos')).toBeVisible();
  });
  it('permite conservar el mensaje específico de carga del consumidor', () => {
    render(<QueryFeedback pending pendingMessage="Cargando indicadores…" error={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando indicadores…');
  });
});
