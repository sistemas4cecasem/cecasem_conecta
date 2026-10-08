# UI 2.7 — Detalle de proceso, timeline y comunicaciones

## Baseline y alcance

Rama `main`; HEAD `0604d4fd7c2cbcbf8f8dfee075244d5acae03a4a`.
Árbol inicialmente limpio, con UI 2.6 incorporada. Frontend inicial: 752 pruebas.
Esta subfase modifica presentación del detalle real de proceso y comunicación,
timeline, notas, recursos asociados y formularios administrativos embebidos.
No modifica los formularios completos de comunicación enviada o recibida.

## Mapa funcional inspeccionado

| Concepto | Responsable | Fuente y comportamiento preservados |
|---|---|---|
| Identidad, estado, cierre, reapertura | RelationshipProcessDetailPage | useProcess / useProcessMutation, versión esperada y autorización contextual |
| Historial administrativo | HistoryEvent / useProcessEvents | Primera página del detalle; posteriores por página, límite 25 |
| Actividad operativa | RelationshipTimeline / TimelineEntry | useTimeline, cursor opaco, orden del servidor, acumulación y retry |
| Nota interna | InternalNoteForm | useInternalNote; no concede participación |
| Índice de comunicaciones | CommunicationsList | useCommunications, páginas de 25 |
| Original de comunicación | CommunicationDetailPage | useCommunication y consulta existente del proceso |
| Enmiendas e invalidación | CommunicationAmendments | useAmendments / useCommunicationAmendment, motivo, confirmación e idempotencia |
| Archivos | Attachments | Consultas y límites existentes, upload y descarga privados |
| Reuniones | ContextMeetings / MeetingEventContent | Consulta contextual y snapshots existentes |
| Oportunidades | Enlaces de proceso/comunicación y snapshots de reuniones | No se añade consulta para listar oportunidades |
| Participantes | Detalle del proceso | Creador, comunicación enviada, recibida y actuación formal de reunión |
| Recomendaciones | ReferralContent / ReferralsPanel | Entradas y relaciones existentes, sin modificar su flujo |
| Restricción de contacto | Formularios existentes y conflictos del servidor | El detalle no tenía consulta de restricción; no se añade una |

Se conservaron todos los tipos de timeline: comunicaciones enviadas/recibidas,
creación/cambio/cierre/reapertura del proceso, correcciones/observaciones/
invalidación de comunicaciones, adjuntos, notas internas, actividad de reunión
y recomendaciones. Se muestran fecha del hecho y registro como conceptos distintos.

## Jerarquía y decisión histórica

1. Cabecera con propósito real, estado y acciones de comunicación.
2. Resumen compacto con actor, creador, creación, última actividad e intención.
3. Acciones de estado y confirmación; conflictos visibles con recarga existente.
4. Timeline como columna principal. Notas internas neutras y formulario al final.
5. Columna secundaria con adjuntos, reuniones, acceso a oportunidades y participantes.
6. Índice de comunicaciones y sección administrativa diferenciados al final.

Las tres perspectivas siguen disponibles: timeline cronológico de hechos,
índice paginado de mensajes e historial administrativo paginado. No se fusionan
sus fuentes ni se eliminan registros. En tablet y móvil se utiliza una columna
con el mismo orden DOM, sin tabs ni información oculta.

En comunicación se conserva el original literal, destinatarios TO/CC/BCC,
cuenta, remitente y registrador; el asunto aparece en la cabecera. Las enmiendas
permanecen en una sección posterior y la invalidación conserva original y motivo.
Traducción y recomendaciones existentes siguen accesibles.

## Cambios compartidos limitados

`Attachments` y `ContextMeetings` admiten `modern` opcional, activado únicamente
en estas vistas. Las páginas globales de reuniones y oportunidades conservan su
presentación anterior. No se modifican primitivas UI, contratos, queries ni
mutaciones. No se añaden dependencias ni componentes de dominio nuevos.

## Verificación

- Baseline frontend: 752 pruebas / 43 archivos.
- Nuevas: 10 pruebas de cabecera, fuentes históricas, CLOSED, cancelación,
  accesibilidad, fechas, original de ambas direcciones y adjuntos.
- Frontend final: 762 pruebas / 43 archivos.
- API: 926 pruebas / 55 suites. Total: 1688 pruebas aprobadas.
- Lint, typecheck, test y build del monorepo: aprobados.
- Las cuatro validaciones del workspace web: aprobadas; repetidas después de los
  últimos ajustes de presentación.
- Diff inspeccionado, `git diff --check` aprobado; sin secretos ni runtime.

Las pruebas existentes siguen protegiendo cursor y orden, conflictos 403/409,
invalidación repetida, permisos, identidad, borradores, participantes, restricciones
de contacto, reuniones, recomendaciones, descarga y upload.

## Revisión visual autenticada

Proceso, comunicación enviada y recibida revisados en 1440×900, 768×1024 y
390×844. Un h1 por vista; sin overflow horizontal observado. Se conservaron
controles reales y mensajes accesibles. Confirmación de cierre abierta y cancelada
sin guardar. No se crearon ni modificaron registros para obtener evidencia.

Se revisó el proceso con Administrador, Búsqueda, Directorio y Planificación.
Los cuatro usuarios demo tienen acciones de estado/cierre para este proceso:
Búsqueda y Planificación aparecen como participantes; Administración conserva
su aviso de intervención excepcional. Ausencia de capability y de autorización
contextual cubiertas por los tests existentes; no se simulan en datos reales.

Capturas locales ignoradas en `storage/qa-ui-2.7/`: proceso desktop superior,
timeline, recursos/historial, tablet, móvil, nota/adjuntos, confirmación de cierre,
tres roles adicionales y detalles enviados/recibidos en las tres resoluciones.
La demo contiene nota, adjunto, comunicaciones y reuniones previos; se reutilizan.
Sesión Administrador y viewport normal restaurados al terminar la QA.

## Observaciones

Persiste la advertencia de tamaño del bundle: principal 772,28 kB. No se realiza
optimización del bundle en esta subfase. CLOSED e invalidación se verificaron
con fixtures y pruebas; no se cerró ni invalidó un registro demo para capturas.

UI 2.7 puede cerrarse con esta observación. Cambios sin commit ni push.
