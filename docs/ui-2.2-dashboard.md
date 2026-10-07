# UI 2.2 — Dashboard operativo

Baseline: main, `6efb8ac98345f96475032dc2a4cff0dd66c3ef36`, limpio.
UI 1 y UI 2.1 ya estaban incorporadas.

## Estructura

HomePage conserva el permiso `relationships.process.read` y useDashboard.
PageHeader presenta el título existente, contexto CECASEM y asOf como time.
La selección de vista sigue dependiendo de `dashboard.view`, nunca del nombre
de rol. dashboard-contract y dashboard-queries permanecen sin modificaciones.
Las tres presentaciones se separan en dashboard-views.tsx; los estilos de
composición están en dashboard.css, dentro de la misma feature.

- Institucional: cinco métricas de procesos/oportunidades, dos métricas de
  actualización del Directorio y una lista de reuniones próximas.
- Búsqueda: procesos activos relevantes, intenciones activas y recordatorios
  sin leer. No muestra secciones institucionales por simetría.
- Planificación: oportunidades pendientes/en preparación, fechas límite
  dentro de los próximos 30 días y reuniones relacionadas.

## Información preservada

Todos los datos antes visibles continúan: fecha de actualización; conteos de
procesos activos/esperando respuesta; oportunidades pendientes/en preparación;
postulaciones pendientes y explicación; organizaciones que requieren revisión
y nunca verificadas; conteos y registros de reuniones con propósito, fecha,
hora, zona y contexto; procesos e intenciones relevantes con actor; fecha de
última actividad de procesos; recordatorios con asunto y fecha; oportunidades
con fecha límite civil. Se conservan los fallbacks de actor y los mensajes vacíos.
Los campos del contrato que no se mostraban antes no se convierten en nuevos
indicadores. No se agregan actividad reciente, gráficos, tareas, calendarios,
acciones rápidas, tendencias, endpoints, queries ni datos demo.

## Enlaces conservados

| Información | Destino existente |
|---|---|
| Procesos activos | /relationship-processes |
| Esperando respuesta | /relationship-processes?state=WAITING_RESPONSE |
| Oportunidades pendientes | /opportunities?status=PENDING_REVIEW |
| Oportunidades en preparación | /opportunities?status=PREPARING |
| Postulaciones pendientes | /opportunities?status=SUBMITTED |
| Organizaciones por revisar | /organizations?status=active&verificationStatus=REVIEW_DUE |
| Organizaciones nunca verificadas | /organizations?status=active&verificationStatus=NEVER_VERIFIED |

Se conservan también todos los enlaces a fichas y los enlaces de consulta:
Ver reuniones, Ver intenciones y Ver notificaciones. Los recordatorios conservan
prioridad processId, intentId y finalmente /notifications.

## Primitivas

Reutiliza PageHeader, Surface, DataList, DataListItem, Metadata, ActionLink,
EmptyState y QueryFeedback.

MetricCard se añade a components/ui porque label/value/description/context/to
son genéricos. No conoce contratos de dominio, no calcula números y no agrega
interacción cuando no recibe to. Con to utiliza Link semántico, conservando
literalmente el destino recibido. Context es opcional; no se inventan estados.
Los estilos consumen tokens existentes y no tienen sombras ni colores por módulo.

QueryFeedback añade solamente pendingMessage opcional. Conserva “Cargando…”
como predeterminado para UI 2.1, mientras el dashboard mantiene “Cargando
indicadores…”, “No se pudo cargar el panel.” y su reintento actual. No cambia
la API de los consumidores existentes ni su lógica de consulta.

## Responsive y accesibilidad

Las métricas utilizan grid adaptable; en 390 px se presenta una sola columna.
Los bloques secundarios tienen dos columnas a partir de 1280 px y una debajo.
No se impone max-w-5xl al workspace. Títulos compactos, metadata secundaria,
listas con divisores y estados vacíos textuales. Se mantiene un h1 y jerarquía
h2, un main del shell, enlaces nativos y foco institucional. Fechas mediante
time; las fechas civiles mantienen el formato UTC anterior para evitar cambios
de día. Las reuniones se formatean en su zona horaria real.

## QA

Pruebas ampliadas para métricas/enlaces exactos, selección por view, permiso,
vacíos de las tres experiencias, reuniones, fechas civiles, actor desconocido
y destinos alternativos de recordatorios. MetricCard protege navegación
opcional, etiquetas, descripción y contexto; QueryFeedback conserva su mensaje.

QA autenticada en la demo con Administrador, Búsqueda, Planificación y Directorio.
Escritorio: 1440 x 900 CSS. Tablet: 768 x 1024 CSS. Móvil: 390 x 844 CSS.
Administrador, Búsqueda y Planificación revisados en las tres resoluciones;
Directorio en escritorio. Se comprobaron textos largos, estados vacíos reales,
fechas, destinos y ausencia de scroll horizontal. Sin escrituras de datos.
Capturas y mediciones en storage/qa-ui-2.2, excluidas de Git.

Validaciones al cierre: lint, typecheck, build y git diff --check aprobados.
Pruebas: 670 antes, 15 nuevas y 685 aprobadas en 40 archivos después.
El build conserva el aviso conocido del bundle principal mayor de 500 kB.
