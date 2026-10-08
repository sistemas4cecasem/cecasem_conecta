# UI 2.6 — Listados de Relaciones y registro de restricciones

## Alcance y baseline

Rama `main`, HEAD inicial `a544c13471641d137070f00fc05b5c764ba4b37e`, árbol limpio.
Rediseño de los listados de intenciones, procesos y restricciones, y finalización
visual del registro de restricciones. No se modificaron detalles, timeline,
comunicaciones, participantes, Directorio, app shell ni backend.

## Cambios

- Cabeceras con contexto Relaciones y acciones de creación según capacidades.
- Filtros, resultados y paginación con las primitivas compartidas existentes.
- Filas con enlaces principales, estados, actores y metadatos legibles.
- Restricciones activas distinguidas con advertencia; motivo, levantamiento y
  consulta del historial del objetivo conservados.
- Registro con cabecera, superficie de formulario, advertencia y revisión previa.
- CSS limitado al módulo: metadatos en dos columnas y una columna en móvil,
  títulos largos que se ajustan y acciones accesibles.
- Los componentes de contexto existentes admiten una presentación opcional para
  los listados. Su presentación original se conserva en los detalles.

Se reutilizaron PageHeader, ActionLink, FilterBar, Surface, FormField, Select,
DataList, DataListItem, Metadata, Pagination, QueryFeedback, EmptyState,
StatusBadge, Alert, Button, FormActions y ConfirmationPanel.
No se añadieron componentes de dominio ni se cambiaron primitivas compartidas.

## Comportamiento preservado

Contratos, endpoints, claves de consulta por identidad, consultas, mutaciones,
cancelación, invalidación, RBAC y capacidades permanecen sin cambios.
Los filtros mantienen sus valores, URL y reinicio de página originales.
La consulta de historial de restricciones filtra el mismo listado por objetivo.
El formulario conserva selección validada, borrador, revisión, confirmación,
errores y protección ante cambios de identidad; revisar no realiza el POST.
No se crearon ni modificaron registros de negocio durante la revisión visual.

## Validación

- Frontend antes: 733 pruebas, 43 archivos.
- Se añadieron 19 pruebas de presentación, estados, metadatos, capacidades y
  navegación; se adaptaron aserciones al marcado semántico de Metadata.
- Frontend después: 752 pruebas, 43 archivos.
- API: 926 pruebas, 55 suites. Total: 1678 pruebas.
- `yarn lint`, `yarn typecheck`, `yarn test`, `yarn build`: aprobados.
- También se ejecutaron las cuatro validaciones del workspace web.
- `git diff --check`: aprobado. Diff revisado y sin secretos ni datos runtime.

La revisión autenticada cubrió Administrador, Búsqueda, Directorio y Planificación.
Los cuatro roles demo disponen de creación en estos listados; la ocultación cuando
falta esa capacidad se verifica con pruebas automatizadas.

Se revisaron los tres listados a 1440×900, 768×1024 y 390×844, sin desbordamiento
horizontal observado. Se comprobaron títulos, controles, estados, paginación,
filtros vacíos y el historial por objetivo. El registro se revisó en escritorio
y móvil, incluida la confirmación y vuelta al borrador sin guardar.

Evidencias locales ignoradas en `storage/qa-ui-2.6/`:

- `intenciones-desktop.jpg`, `intenciones-tablet.jpg`, `intenciones-mobile.jpg`.
- `procesos-desktop.jpg`, `procesos-tablet.jpg`, `procesos-mobile.jpg`.
- `restricciones-desktop.jpg`, `restricciones-tablet.jpg`, `restricciones-mobile.jpg`.
- Capturas de cada listado con sufijos `research`, `board` y `planning`.
- `intenciones-filtro-vacio.jpg`, `restricciones-vacio.jpg`.
- `restricciones-historial-objetivo.jpg`.
- `registro-restriccion-desktop.jpg`, `registro-restriccion-mobile.jpg` y
  `registro-confirmacion-mobile.jpg`.

La captura móvil de intenciones corresponde a la vista inicial del viewport;
las capturas no sustituyen las verificaciones funcionales automatizadas.

## Observaciones y cierre

La URL de intenciones ya acepta `CLOSED`, pero el selector existente no incluye
«Cerradas». Se conservaron las opciones originales para respetar el alcance.
Vite advierte del bundle principal de 769,23 kB; el build termina correctamente.
No se amplió esta subfase para introducir división del bundle.

UI 2.6 puede cerrarse con estas observaciones. No se inició otra subfase.
Los cambios quedan sin commit ni push para la revisión del usuario.
