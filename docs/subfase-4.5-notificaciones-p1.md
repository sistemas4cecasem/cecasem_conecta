# Subfase 4.5 — Notificaciones internas P1

## Corrección vigente de audiencia — 5 de octubre de 2026

La decisión oficial de la corrección final de Fase 4 reemplaza la interpretación de audiencia documentada en esta entrega: MEETING_CREATED, MEETING_CANCELLED, MEETING_COMPLETED y MEETING_RESCHEDULED incluyen Administradores y Directorio activos autorizados globalmente, además de participantes formales del proceso e internos de la reunión. La unión se deduplica y excluye al actor. MEETING_PARTICIPANT_ADDED sigue dirigido únicamente al usuario interno incorporado; asistencia, acuerdos y cambios menores siguen sin aviso.

PROCESS_ACHIEVED incorpora Administradores y Directorio globales más participantes formales activos autorizados, excluyendo al actor. Proviene exclusivamente del evento histórico CLOSED/CLOSED/ACHIEVED, con recibo por hecho y audiencia fijada al primer procesamiento exitoso. Los avisos y recibos previos se conservan sin recalcularlos.

El resto de este informe conserva la decisión y las evidencias históricas de la entrega original; no representa la matriz vigente de reuniones. Véase [la corrección final](fase-4-correcciones-finales.md) para contratos, migraciones y revalidación actuales.

## Baseline y alcance

Rama `main`, HEAD `26db90788f0eb98ffdbbdd36377661d0c0184d70`, árbol inicial limpio. Estaban incorporadas las fases 0–3, 4.1, 4.2, P0 de 4.5, 4.3 y 4.4. Esta entrega amplía el sistema existente; no crea un segundo centro, scheduler, infraestructura ni dependencias. Sin commit ni push. No inicia 4.6.

## Sistema reutilizado

Se mantienen Notification, NotificationDelivery y NotificationCheckpoint; los tres endpoints `/api/v1/me/notifications`; paginación por cursor; filtros all/read/unread; COUNT backend; lectura idempotente; privacidad por sesión; advisory locks; recibos durables y barridos repetidos. El scheduler backend sigue a cinco segundos y el contador frontend a treinta segundos.

## Política de destinatarios

| Tipo | Destinatarios |
| --- | --- |
| OPPORTUNITY_CREATED | Administrador, Directorio y Planificación activos, incluido el actor institucional conforme a P0 |
| OPPORTUNITY_DISCARDED | Esos tres roles activos, excluido el actor |
| OPPORTUNITY_FINISHED | Esos tres roles activos, excluido el actor |
| MEETING_CREATED | Participantes formales reales del proceso e internos explícitos de la reunión, excluido el actor |
| MEETING_CANCELLED | Los mismos grupos relevantes, excluido el actor |
| MEETING_COMPLETED | Los mismos grupos relevantes, excluido el actor |
| MEETING_RESCHEDULED | Los mismos grupos, solo con evidencia de cambio material, excluido el actor |
| MEETING_PARTICIPANT_ADDED | Únicamente el usuario interno incorporado, excluido el actor |

La elegibilidad exige usuario activo y permisos de notificaciones, reunión y lectura de los contextos vinculados. No se exige una sesión abierta. Los usuarios externos y referencias textuales no reciben avisos ni generan cuentas.

No se encontró respaldo en las reglas disponibles para dar visibilidad global de reuniones a Administrador/Directorio. Estos roles reciben reuniones cuando participan, como cualquier otro rol. Directorio conserva visibilidad global de los eventos institucionales de oportunidades definidos por P0/P1. Búsqueda no recibe oportunidades globales ni reuniones ajenas a su participación.

No se inventa participación: Relationships proporciona los ProcessParticipant persistidos. Crear notas, adjuntar archivos, registrar derivaciones o crear una oportunidad no otorga destinatarios indirectamente.

## Anti-ruido y autor

No notifican ediciones descriptivas de oportunidades, PREPARING/SUBMITTED, cambios menores de propósito, asistencia individual, acuerdos individuales, archivos ni derivaciones. Tampoco se notifican lecturas.

Meeting UPDATED únicamente produce MEETING_RESCHEDULED cuando el evento conserva `changes.previous` y `changes.next` y difieren campos explícitos: scheduledAt, timezone, modality, meetingUrl o location. Una ausencia de evidencia no produce heurísticas ni avisos. PostgreSQL protege también esta condición.

Se conserva la inclusión deliberada del autor institucional en OPPORTUNITY_CREATED, ya aceptada en P0. Todos los nuevos tipos P1 omiten al actor, incluido incorporarse a sí mismo. Los destinatarios quedan fijados al primer procesamiento exitoso, incluso si el resultado es un recibo sin destinatarios. Cambios posteriores de rol, actividad o participación no recalculan las entregas de ese hecho. La reactivación conserva avisos históricos y no entrega retroactivamente hechos ya procesados.

## Consumo durable y fronteras

Un único NotificationConsumer coordina Opportunities y Meetings mediante el scheduler existente. Reutiliza un método común de procesamiento con transacciones independientes por fuente:

- `opportunity-created`: conserva el checkpoint P0, advisory lock `(1128612691, 45)`.
- `meeting-activity`: checkpoint de reuniones, advisory lock `(1128612691, 46)`.

Cada fuente procesa hasta 25 hechos por lote. Tiene cursor compuesto fecha/UUID y límite superior fijado al iniciar el barrido. Las altas nuevas no impiden finalizarlo. Al completar, vuelve al inicio: los recibos deduplican y los barridos recuperan commits tardíos detrás del cursor y fallos aislados.

Las dos fuentes se intentan aunque falle completamente una de ellas. La fuente sana confirma su lote; el fallo se informa al scheduler para reintentar sin revelar contenido privado.

Cada evento relevante utiliza SAVEPOINT: recibo y avisos se confirman juntos o se revierten juntos, permitiendo continuar con hechos posteriores. Una restricción única `(recipientUserId, sourceEventId, type)` protege la deduplicación. El recibo único del hecho impide recalcular destinatarios después de reinicios/reprocesamientos.

Meetings amplía mínimamente su contrato compatible `recordedActivity(after, limit, through?)`, agrega `recordedActivityUpperBound()`, cambios explícitos y userId del participante incorporado. También expone proyecciones mínimas y audiencia por lote. Relationships expone participantes formales por lote; Users selecciona candidatos activos con locks ordenados. Notifications no consulta las tablas internas de productores ni Directorio.

Opportunity y Meeting no llaman ni dependen transaccionalmente de Notifications. No se agrega un evento NOTIFIED ni auditoría por cada aviso o lectura. NotificationDelivery conserva la trazabilidad técnica.

## Modelo e integridad

Notification conserva opportunityId nullable y agrega meetingId nullable. Cada aviso tiene exactamente un contexto según su tipo. Su procedencia se liga al recibo durable; el recibo tiene una FK compuesta al OpportunityEvent o MeetingEvent real, con contexto y tipo fuente.

Constraints/triggers impiden contextos mezclados, fuentes inexistentes, tipos incompatibles, avisos a otra persona por incorporación y recibos de cambios de reunión no materiales. Procedencia y recibos son inmutables; readAt sigue siendo el único campo ordinario mutable. Se preservan los avisos y recibos P0 existentes.

## API y privacidad

Se conservan:

- GET `/api/v1/me/notifications`
- GET `/api/v1/me/notifications/unread-count`
- PATCH `/api/v1/me/notifications/:id/read`

No hay endpoints por tipo ni recipient enviado por el cliente. El destinatario se obtiene de la sesión. UUID ajeno devuelve 404 incluso a Administrador, falta de sesión devuelve 401 y las respuestas tienen Cache-Control: no-store.

Contrato: id, type, createdAt, readAt y exactamente una proyección navegable. Oportunidad: id, nombre, estado. Reunión: id, scheduledAt UTC, timezone IANA, propósito limitado a 160 caracteres, processId/opportunityId. No hay acuerdos, cuerpos de comunicaciones, requisitos completos ni participantes externos en el aviso.

## Frontend

Se reutilizan centro y badge, filtros, páginas, carga/error/vacío y protección de identidad/cache. Los ocho tipos tienen etiquetas en español. Reuniones muestran su propósito breve y fecha en su zona explícita. Al abrir se marca leído y se navega a `/meetings/:id` o `/opportunities/:id`; un fallo de lectura conserva navegación e invalidación del contador.

El diseño existente conserva flex-wrap, break-words y controles de altura mínima. La comprobación visual de navegador/móvil quedó limitada por la política de URL del navegador, que rechazó seleccionar la pestaña existente. No se intentó eludir el rechazo ni se cerraron pestañas, ventanas o Codex. Las pruebas de interfaz sí comprobaron etiquetas, badge, rutas, lectura y fallos de marcado.

## Migraciones

Las 47 migraciones históricas se conservan intactas. Nuevas:

1. `20261005040000_notification_p1_types`: agrega siete tipos al enum existente.
2. `20261005040001_notification_p1_sources`: amplía contexto/FKs, mantiene datos P0, agrega índices, checkpoints e integridad/inmutabilidad.

La cadena de 49 se desplegó desde cero en PostgreSQL 18 con rol `cecasem`, `rolsuper=false`. Prisma validate, migrate status y migrate diff se registran en la verificación final.

## Pruebas y verificaciones

Cobertura nueva P1: 33 casos unitarios de clasificación, campos materiales, roles y autor; 27 PostgreSQL/HTTP sobre fuentes, audiencia, concurrencia, reinicio, checkpoints, commits tardíos, rollback parcial, FKs, privacidad, cambios de rol/actividad y consultas por lote; 13 frontend de los ocho tipos, badge, zona, navegación, lectura y contratos. Son 73 casos, incluidos en los totales finales.

E2E HTTP sobre Docker real con seis usuarios sintéticos: Búsqueda crea y descarta oportunidad; Planificación/Directorio/Administrador reciben sin duplicar CREATED. Búsqueda crea reunión ligada a un proceso de otro participante formal; incorpora usuario interno, Person externa real y referencia textual. Avisos relevantes llegan a participantes; Búsqueda ajeno y roles sin participación no reciben reuniones globales. Cambios materiales, cancelación y realización se notifican. Asistencia/acuerdo no aumentan el contador. Lectura confirma readAt y reduce no leídas de 9 a 8, manteniendo 404 ajeno y 401 anónimo.

La navegación a la ficha se comprobó por HTTP y mediante pruebas de interfaz, sin afirmar inspección visual del navegador bloqueado.

## Validación final

La regresión completa pasó: API 812 pruebas/45 suites, frontend 556/30 suites e integración PostgreSQL/HTTP 1164/29 suites. Tras limitar la frontera de reuniones para que no entregue acuerdos al consumidor, se repitieron las 77 pruebas de reuniones/notificaciones y las 812 API; ambas ejecuciones pasaron. El frontend no cambió en ese ajuste.

| Validación ejecutada con Corepack/Yarn 4 | Resultado |
| --- | --- |
| `yarn lint` | Pasó |
| `yarn typecheck` | Pasó |
| `VITEST_MAX_WORKERS=1 yarn test` | Pasó: API 812 y frontend 556 |
| `yarn workspace @cecasem-conecta/api test` final | Pasó: 812 |
| `yarn workspace @cecasem-conecta/api test:integration` | Pasó: 1164 |
| Integración dirigida final: reuniones y notificaciones | Pasó: 77 en tres suites |
| `yarn workspace @cecasem-conecta/api prisma:validate` | Schema válido |
| `prisma:migrate:deploy` / `prisma:migrate:status` | 49 desde cero; actualizado |
| `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | Sin diferencias |
| Actualización 47 → 49 con datos P0 | Conservó aviso, recibo y readAt; sin duplicados al reprocesar |
| `yarn build` | API/web compiladas |
| Docker Compose config/build/startup | Imágenes finales construidas; servicios saludables |
| E2E HTTP y reinicio real de API | Pasó; conserva avisos, lectura y contador |
| Inspección visual navegador/móvil | No ejecutada: acceso a pestaña rechazado por política de URL |
| `git diff --check` y comprobación de nuevos archivos | Sin errores |

Vitest utilizó un worker; no se modificaron timeouts globales. Avisos no bloqueantes: VM Modules experimental de Jest, deprecación del adaptador pg por llamadas concurrentes y chunk principal de Vite de 718.42 kB. Los errores provocados por tests de rollback son esperados, no fallos finales.

Se comprobaron dos bases vacías con la cadena completa, y una tercera con 47 migraciones y datos P0 antes de aplicar las dos nuevas. Todas las operaciones se limitaron al entorno de auditoría, con rol de aplicación sin superusuario. Las 47 migraciones históricas permanecen intactas.

## Limpieza y estado final

Se desactivaron los seis usuarios sintéticos de E2E, se retiraron sus hashes y se revocaron sesiones. Se retiraron únicamente contenedores/red del proyecto QA, conservando volúmenes e historia. Los contenedores previos del usuario siguieron activos. No se cerraron pestañas, ventanas ni Codex.

La revisión automática rechazó tanto la limpieza recursiva de temporales en `.git` como la eliminación explícita de los cuatro archivos de credenciales, con el motivo genérico `blocked by policy`. No se intentaron otras vías. Los temporales de QA permanecen ignorados en `.git`, incluidos `p1.env`, `p1-login.json`, `p1-seed.cjs` y `p1-http-context.json`; no forman parte del diff ni están preparados para commit. El entorno está retirado y los accesos sintéticos revocados.

Subfase 4.5 completada con observaciones: no quedan criterios funcionales pendientes; la inspección visual de navegador/móvil no se presenta como realizada. La implementación quedó verificada por pruebas automatizadas y HTTP real, con el rechazo de la herramienta de navegador documentado.

Diff sin secretos, entornos reales, subidas, backups ni datos de runtime. Índice vacío y HEAD sin cambios. NO COMMIT / NO PUSH. Queda listo el alcance funcional de 4.5 y la base para 4.6; no se implementaron recordatorios.

## Inventario final

19 archivos: 12 modificados y siete nuevos. Se agrupan en schema/dos migraciones, ampliación del consumidor y DTO/proyecciones, fronteras públicas de Meetings/Relationships/Users, centro frontend, suites y este documento. Sin cambios de dependencias, lockfile ni infraestructura versionada.

```text
apps/api/prisma/schema.prisma
apps/api/src/modules/meetings/meetings.service.ts
apps/api/src/modules/notifications/notification-consumer.spec.ts
apps/api/src/modules/notifications/notification-consumer.ts
apps/api/src/modules/notifications/notification.dto.ts
apps/api/src/modules/notifications/notifications.module.ts
apps/api/src/modules/notifications/notifications.service.ts
apps/api/src/modules/relationships/relationship-processes.service.ts
apps/api/src/modules/users/users.service.ts
apps/api/test/notifications.integration-spec.ts
apps/web/src/features/notifications/contracts.ts
apps/web/src/features/notifications/notifications-page.tsx
apps/api/prisma/migrations/20261005040000_notification_p1_types/migration.sql
apps/api/prisma/migrations/20261005040001_notification_p1_sources/migration.sql
apps/api/src/modules/notifications/notification-policy.spec.ts
apps/api/src/modules/notifications/notification-policy.ts
apps/api/test/notifications-p1.integration-spec.ts
apps/web/src/features/notifications/notifications-p1.test.tsx
docs/subfase-4.5-notificaciones-p1.md
```
