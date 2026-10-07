import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { ActionLink, Button } from './actions';
import { FormField, FormSection, Input, Select, Textarea } from './forms';
import { PageHeader, Surface } from './layout';
import { Alert, ConfirmationPanel, EmptyState, QueryFeedback, StatusBadge } from './feedback';
import { DataList, DataListItem, LoadMore, Metadata, Pagination } from './lists';

describe('Primitivas visuales compartidas', () => {
  it('el botón auxiliar no envía formularios y el submit conserva su función', async () => {
    const submit = vi.fn();
    render(<form onSubmit={event => { event.preventDefault(); submit(); }}><Button>Consultar</Button><Button type="submit">Guardar</Button></form>);
    await userEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(submit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(submit).toHaveBeenCalledOnce();
  });
  it('conserva disabled y no ejecuta handlers cuando está deshabilitado', async () => {
    const action = vi.fn();
    render(<Button disabled pending onClick={action}>Guardando…</Button>);
    const button = screen.getByRole('button', { name: 'Guardando…' });
    expect(button).toBeDisabled(); expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button); expect(action).not.toHaveBeenCalled();
  });
  it('pending informa actividad sin imponer disabled al consumidor', () => {
    render(<Button pending>Consultar</Button>);
    expect(screen.getByRole('button')).toBeEnabled();
  });
  it('los enlaces siguen siendo navegación semántica', () => {
    render(<MemoryRouter><ActionLink appearance="action" to="/people">Consultar personas</ActionLink></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Consultar personas' })).toHaveAttribute('href', '/people');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('el encabezado tiene un título y conserva las acciones', async () => {
    const action = vi.fn();
    render(<PageHeader title="Categorías" eyebrow="Directorio" description="Catálogo institucional" primaryAction={<Button onClick={action}>Crear</Button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Categorías' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Crear' })); expect(action).toHaveBeenCalledOnce();
  });
  it('asocia label, ayuda, error y descripciones externas sin alterar el control', () => {
    render(<><p id="contexto">Contexto adicional</p><FormField id="nombre" label="Nombre" help="Usa el nombre institucional" error="Indica un nombre" describedBy="contexto" required>
      {control => <Input {...control} name="name" />}</FormField></>);
    const input = screen.getByLabelText('Nombre (obligatorio)');
    expect(input).toHaveAttribute('name', 'name');
    expect(input).toHaveAttribute('aria-describedby', 'contexto nombre-help nombre-error');
    expect(input).toHaveAccessibleDescription('Contexto adicional Usa el nombre institucional Indica un nombre');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Indica un nombre');
    expect(input).not.toBeRequired(); // La validación sigue en el consumidor.
  });
  it('retira las referencias de error cuando el campo vuelve a ser válido', () => {
    const { rerender } = render(<FormField id="campo" label="Nombre" error="Error">{control => <Input {...control} />}</FormField>);
    rerender(<FormField id="campo" label="Nombre">{control => <Input {...control} />}</FormField>);
    expect(screen.getByLabelText('Nombre')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('Nombre')).not.toHaveAttribute('aria-describedby');
  });
  it('genera identificadores distintos para campos repetidos', () => {
    render(<><FormField label="Origen">{control => <Input {...control} />}</FormField><FormField label="Destino">{control => <Input {...control} />}</FormField></>);
    expect(screen.getByLabelText('Origen').id).not.toBe(screen.getByLabelText('Destino').id);
  });
  it('preserva refs, readonly, disabled y select/textarea nativos', () => {
    const ref = createRef<HTMLInputElement>();
    render(<><Input ref={ref} aria-label="Referencia" readOnly value="CECASEM" /><Select aria-label="Estado" disabled><option>Activa</option></Select><Textarea aria-label="Motivo" /></>);
    expect(ref.current).toBe(screen.getByLabelText('Referencia'));
    expect(ref.current).toHaveAttribute('readonly'); expect(screen.getByLabelText('Estado')).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Motivo' }).tagName).toBe('TEXTAREA');
  });
  it('mantiene register y la captura de valores de React Hook Form', async () => {
    const submit = vi.fn();
    function RegisteredForm() {
      const form = useForm<{ name: string }>();
      return <form onSubmit={form.handleSubmit(values => submit(values))}><FormField label="Nombre">{control => <Input {...form.register('name')} {...control} />}</FormField><Button type="submit">Guardar</Button></form>;
    }
    render(<RegisteredForm />); await userEvent.type(screen.getByLabelText('Nombre'), 'Institución');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' })); expect(submit).toHaveBeenCalledWith({ name: 'Institución' });
  });
  it.each(['neutral', 'info', 'success', 'warning', 'danger'] as const)('el badge %s conserva una etiqueta textual', tone => {
    render(<StatusBadge tone={tone}>Pendiente de revisión</StatusBadge>);
    expect(screen.getByText('Pendiente de revisión')).toBeVisible();
  });
  it('nombra secciones mediante encabezado y conserva disabled del fieldset', () => {
    render(<><Surface heading="Contexto">Contenido</Surface><FormSection heading="Datos" disabled><Input aria-label="Nombre" /></FormSection></>);
    expect(screen.getByRole('region', { name: 'Contexto' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Datos' })).toBeVisible(); expect(screen.getByLabelText('Nombre')).toBeDisabled();
  });
  it('la lista y metadata mantienen semántica de registros y descripción', () => {
    render(<DataList><DataListItem><Metadata items={[{ label: 'País', value: 'Bolivia' }]} /></DataListItem></DataList>);
    expect(screen.getAllByRole('listitem')).toHaveLength(1); expect(screen.getByText('País').tagName).toBe('DT'); expect(screen.getByText('Bolivia').tagName).toBe('DD');
  });
  it('la paginación conserva límites y entrega la página solicitada', async () => {
    const onPage = vi.fn(); const { rerender } = render(<Pagination page={1} total={26} onPage={onPage} />);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' })); expect(onPage).toHaveBeenCalledWith(2);
    rerender(<Pagination page={2} total={26} onPage={onPage} />); expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' })); expect(onPage).toHaveBeenLastCalledWith(1);
  });
  it('cargar más delega el handler sin introducir estado de paginación', async () => {
    const load = vi.fn(); render(<LoadMore onClick={load}>Cargar más historial</LoadMore>);
    await userEvent.click(screen.getByRole('button', { name: 'Cargar más historial' })); expect(load).toHaveBeenCalledOnce();
  });
  it('el feedback conserva el mensaje funcional, reintento y estado de carga', async () => {
    const retry = vi.fn(); const { rerender } = render(<QueryFeedback pending error={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
    rerender(<QueryFeedback pending={false} error errorMessage="Acceso denegado" retry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Acceso denegado'); await userEvent.click(screen.getByRole('button', { name: 'Reintentar' })); expect(retry).toHaveBeenCalledOnce();
    rerender(<QueryFeedback pending={false} error={false} />); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('alertas y confirmaciones no deciden ni ejecutan acciones por su cuenta', async () => {
    const confirm = vi.fn(); render(<><Alert role="alert" tone="warning" title="Restricción">No contactar</Alert><ConfirmationPanel title="Confirmar" actions={<Button onClick={confirm}>Confirmar decisión</Button>}>Revisa el motivo</ConfirmationPanel><EmptyState title="Sin resultados" description="Ajusta los filtros" /></>);
    expect(screen.getByRole('alert')).toHaveTextContent('No contactar'); expect(screen.getByRole('region', { name: 'Confirmar' })).toBeVisible(); expect(confirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar decisión' })); expect(confirm).toHaveBeenCalledOnce();
  });
});
