# UI 2.8 — Oportunidades y reuniones

## Baseline

Rama `main`, HEAD `97eabc79ca7d679c82c16cc64e4d5196ba026c6c`.
UI 2.7 incorporada; árbol inicial limpio. Frontend previo: 762 pruebas.

## Inspección y límites

Se inspeccionaron páginas, formularios, contratos, hooks, rutas, tests,
autorización y primitivas existentes. Los cambios se limitan a presentación.
No se modifican backend, API, contratos, queries, mutations, RBAC, permisos,
Dashboard, App Shell, procesos, timeline ni comunicaciones.

| Flujo | Fuente preservada | Comportamiento |
|---|---|---|
| Listado de oportunidades | useOpportunities | Estado URL; conserva processId, communicationId y organizationId válidos; páginas de 25 |
| Detalle y creación | useOpportunity / useOpportunityMutation | Origen fijo, organizations, idempotencia y versión esperada |
| Cambio de estado | allowedStatuses / stateFormSchema | Transiciones del servidor, descarte con motivo, resultado final opcional |
| Historial de oportunidad | useOpportunityHistory | Cursor opaco, páginas acumuladas y acceso sujeto a files.read |
| Listado de reuniones | useMeetingQuery | Estado local; processId y opportunityId URL; páginas de 25 |
| Planificación | PlanningFormView / planningBody | Fecha local, zona IANA y desambiguación; conserva defaults y payload |
| Edición / realización | canEdit / canComplete y permisos | Capabilities contextuales del servidor; actualización con expectedVersion |
| Cancelación | CancelForm | Motivo obligatorio y comando explícito existente |
| Participantes | ParticipantForm / ParticipantRow | Interno, persona externa y externo textual; snapshots; asistencia explícita |
| Acuerdos e historial | useMeetingQuery / useMeetingCommand | Registros posteriores; tres paginaciones independientes |
| Archivos y reuniones vinculadas | Attachments / ContextMeetings | Se activa modern ya existente; consultas y reglas originales |

Los estados reales de oportunidades son Pendiente de revisión, En preparación,
Postulada, Descartada y Finalizada. Los de reuniones son Programada, Realizada
y Cancelada. No se inventan estados ni confirmaciones adicionales.

## Presentación

Los listados tienen PageHeader, acción de creación autorizada, FilterBar,
resumen de resultados del total existente, DataList, metadatos y paginación.
Los títulos siguen enlazando al detalle y se conserva el contexto institucional.

La oportunidad presenta identificación y seguimiento, origen e información
complementaria, edición, estado, documentos, reuniones e historial separados.
La reunión utiliza el propósito real como h1, planificación y contexto,
acciones, participantes internos/externos, acuerdos, archivos e historial.
No se duplica el timeline del proceso.

Creación, edición y estado de oportunidad; planificación, participantes,
asistencia, cancelación y acuerdos de reunión migraron a controles existentes.
React Hook Form, Zod, límites, defaults, handlers, validaciones, borradores,
idempotencia y conflictos se conservan. DirectoryTargetPicker y datalist IANA
se mantienen como controles especializados. No hay formularios diferidos.

## Fechas

El deadline civil mantiene su string YYYY-MM-DD en input, payload y time;
deadlineLabel no lo convierte en un instante UTC. Se resalta la fecha y se
indica ausencia, fecha futura, vencida o que vence hoy. La comparación visual
usa el día civil local del navegador y no modifica el estado de negocio.
No existe umbral de proximidad en este listado; no se reutiliza como regla
el indicador de próximos 30 días del Dashboard.

La reunión conserva meetingDate con la zona IANA del registro. scheduledLocal,
scheduledAt, timezone y disambiguation no cambian de interpretación ni de
serialización. Fecha programada y fecha administrativa tienen time separados.

## Accesibilidad y responsive

Un h1 por vista; títulos completos, enlaces y botones semánticos; FormField
asocia label, ayuda y errores mediante id, aria-describedby y aria-invalid.
FormSection y FormActions ordenan los controles. Estados siempre textuales.
En móvil, metadatos y acciones de cabecera se apilan; textos largos se envuelven.
Los historiales y participantes conservan todos los datos en el mismo DOM.

## QA autenticada

Se revisaron los dos listados, los dos detalles y los dos formularios de
creación en 1440×900, 768×1024 y 390×844: 18 combinaciones, un h1 y sin
desbordamiento horizontal observado. También se abrió y cerró la edición
de oportunidad y se inspeccionó planificación y participantes de reunión.
No se guardaron formularios ni se crearon, cancelaron o finalizaron registros.

Administrador, Planificación, Directorio y Búsqueda se probaron en navegador.
Todos tienen permisos de estos módulos en el RBAC actual. La reunión demo
futura admite edición y participantes, pero no realización; esa restricción
contextual se comprobó realmente. Las identidades sin capabilities y estados
sensibles se verifican con fixtures seguros, sin alterar datos demo.

Capturas locales ignoradas: storage/qa-ui-2.8/. Incluyen escritorio, tablet,
móvil, formularios, edición, participantes, Planificación, Directorio y Búsqueda.
Se utilizan capturas de viewport para móvil/tablet para evitar artefactos del
método de captura completa. Sesión Administrador y viewport normal restaurados.

## Validación

23 pruebas nuevas; frontend final 785 / 43 archivos.
API 926 / 55 suites; monorepo 1711 pruebas aprobadas.
Lint, typecheck, tests y build del monorepo aprobados. Las cuatro validaciones
web también se repitieron después del último ajuste de presentación.
Diff revisado; git diff --check aprobado; sin secretos ni artefactos QA.

Persiste la advertencia existente de bundle mayor a 500 kB. No se optimiza
el bundle en esta subfase. No hay cambios de arquitectura ni dependencias.

Los contadores conservan el plural para cero y varios resultados y utilizan
el singular para un resultado: «1 oportunidad encontrada» y «1 reunión encontrada».
Se cubren los tres casos en cada módulo mediante pruebas.

UI 2.8 puede cerrarse con esta observación. Validación realizada antes del commit;
sin push.
