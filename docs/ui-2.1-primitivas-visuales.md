# UI 2.1 — Primitivas visuales compartidas

Las primitivas viven en `apps/web/src/components/ui`. Son componentes de
presentación con React y HTML nativo; no requieren dependencias adicionales.
Sus estilos consumen los tokens de UI 1 mediante `primitives.css`, importado
desde `styles.css`. El App Shell permanece sin modificaciones.

## Acciones y composición

- `Button`: `variant` primary/secondary/ghost/danger, atributos nativos y ref.
  El tipo predeterminado es button. En formularios se debe indicar submit
  explícitamente. `pending` expone aria-busy; el consumidor conserva el
  control de disabled, el texto y los handlers. Danger se reserva para
  acciones destructivas o excepcionales; volver y cancelar son secondary.
- `ActionLink`: conserva los props de React Router y la semántica de enlace;
  `appearance` normal/action/list/context cambia solamente su presentación.
- `PageHeader`: título h1 compacto; eyebrow, description, metadata,
  primaryAction y actions opcionales. Los slots aceptan contenido existente.
- `Surface`: sección sin sombra, con heading h2, description y actions
  opcionales. No usar como contenedor de cada párrafo.
- `FormSection`: fieldset y legend sin card; conserva disabled nativo.
- `FormActions`: grupo flexible; conserva el orden del contenido.
- `FilterBar`: compone controles, actions y summary. No posee estado ni
  modifica filtros, parámetros URL, consultas o contadores.
- `DataList` / `DataListItem`: ul/li con divisores, sin tablas genéricas ni
  sombra por registro. Títulos, enlaces, estados, descripciones y acciones
  se componen como contenido, manteniendo la semántica del dominio fuera.
- `Metadata`: dl con items `{ label, value }`; usar etiquetas únicas por grupo.
- `Pagination`: conserva page, total, pageSize y onPage del patrón existente.
- `LoadMore`: contenedor y Button; el consumidor decide visibilidad, cursor,
  handler, disabled, pending y etiqueta. No se combina con Pagination.

## Campos y compatibilidad

`Field`, `inputClass`, `buttonClass`, `QueryState`, `MutationError` y
`Pagination` de `directory-ui.tsx` permanecen disponibles sin cambios.
Las siguientes subfases pueden migrar consumidores uno por uno.

`Input`, `Select` y `Textarea` aceptan atributos nativos y ref de React 19,
sin adaptadores especiales para React Hook Form. No agregan validación.

```tsx
<FormField
  label="Nombre"
  help="Usa el nombre institucional."
  error={form.formState.errors.name?.message}
>
  {control => <Input {...form.register('name')} {...control} maxLength={150} />}
</FormField>
```

La función de render proporciona id, aria-describedby y aria-invalid.
El label usa htmlFor. Ayuda y error tienen identificadores estables mediante
useId; describedBy permite preservar referencias externas. FieldHelp también
puede usarse directamente. `required` muestra “(obligatorio)”; no agrega
validación HTML. Si el flujo ya utiliza required nativo, debe conservarlo
explícitamente en el control. Name, ref y handlers siguen en el consumidor.

## Estados y feedback

- `StatusBadge`: texto obligatorio y tone neutral/info/success/warning/danger.
  No interpreta estados de negocio ni define equivalencias entre ellos.
- `Alert`: tone, title, contenido y actions. El consumidor elige role cuando
  corresponde; no se anuncian todos los mensajes estáticos como alertas.
- `EmptyState`: title, description y action; sin ilustraciones.
- `QueryFeedback`: pending/error/errorMessage/retry. Mantiene prioridad de
  carga y no infiere errores desde contratos de la API. Pasar el mensaje
  funcional existente cuando lo haya; no sustituirlo por uno genérico.
- `ConfirmationPanel`: contenedor semántico con title, contenido, actions
  y tone warning/danger. No abre diálogos, confirma decisiones ni ejecuta
  mutaciones por sí mismo. No reemplaza window.confirm.

## Muestras incorporadas

1. Categorías: encabezado, editor de nombre, acciones de guardar/cancelar,
   filtro de estado, contenedor de filas, badge y paginación/feedback.
   Los botones por registro, historial y MutationError permanecen legacy.
2. Registro de restricción: alerta existente, campo de motivo, botón de
   revisión, contenedor de confirmación y acciones existentes. El selector
   de objetivo y MutationError permanecen legacy.

No se migraron Dashboard, Organizaciones, Procesos, Usuarios, Reuniones ni
Comunicaciones. No existe ruta de laboratorio en producción. Metadata y
LoadMore están preparados y probados; su adopción visual gradual queda para
las próximas pantallas, al igual que feedback de mutaciones y clases legacy.

## Validación

Las pruebas de primitivas protegen submit, disabled, refs, RHF, nombres y
descripciones accesibles, texto de badges, listas, paginación, reintento y
delegación de acciones. Las pruebas de los flujos existentes permanecen.
La comprobación visual se realiza en las dos muestras reales, sin guardar
datos ni confirmar restricciones. Capturas locales en storage, fuera de Git.

Resultado al cierre: lint, typecheck, build y diff check aprobados. Antes:
649 pruebas en 38 archivos. Después: 670 pruebas en 39 archivos, con 21
pruebas nuevas. Continúa el aviso conocido del bundle principal > 500 kB.
QA con Administrador demo en 1440 x 900, 768 x 1024 y 390 x 844 CSS:
encabezados, filtros, filas, badge, paginación, error accesible y foco RHF,
estado vacío, alerta, textarea y confirmación/cancelación local. No se
detectó scroll horizontal en las muestras. La confirmación nunca se ejecutó.
