# Fase 4 — Correcciones finales P1 y revalidación

## Baseline y alcance

5 de octubre de 2026. Rama `main`, HEAD `ed28fb9eadc2a408ae041e064044fb83fdaaaa91`. El árbol inicial tenía 59 entradas locales de trabajos anteriores, incluidas 4.6 y 4.7; se preservaron. Esta corrección modifica únicamente notificaciones de proceso concretado, audiencia institucional de reuniones y el ciclo Directory/Opportunities, con sus contratos, migraciones, pruebas y documentación. Sin commit, push ni inicio de Fase 5. Preparación para segunda reauditoría; no constituye cierre de Fase 4.

## Fuente, audiencia y anti-ruido

`PROCESS_ACHIEVED` deriva exclusivamente de un `RelationshipProcessEvent` confirmado con `type=CLOSED`, `newState=CLOSED` y `result=ACHIEVED`. Notifications consume la frontera pública de Relationships: `recordedActivity`, `recordedActivityUpperBound`, `notificationParticipants` y `achievedNotificationSummaries`. No infiere el hecho desde el estado actual ni modifica el timeline.

| Evento | Audiencia activa y autorizada | Actor |
| --- | --- | --- |
| PROCESS_ACHIEVED | Administrador y Directorio globales, unidos a ProcessParticipant formales | Excluido |
| MEETING_CREATED/CANCELLED/COMPLETED/RESCHEDULED | Administrador y Directorio globales, unidos a participantes formales del proceso e internos de la reunión | Excluido |
| MEETING_PARTICIPANT_ADDED | Solo el usuario interno incorporado | Excluido |
| OPPORTUNITY_CREATED | Política P0: Administrador, Directorio y Planificación | Conserva inclusión institucional P0 |
| OPPORTUNITY_DISCARDED/FINISHED | Política P1 previa de oportunidades | Excluido |

Búsqueda y Planificación no tienen broadcast global de procesos ni reuniones. Cada unión se deduplica. La selección no exige sesión abierta y revalida permisos de lectura de los contextos. Un aviso no concede permisos nuevos. Los roles/actividad posteriores no recalculan un hecho con recibo confirmado.

No notifican otros resultados de cierre (`REJECTED`, `NO_RESPONSE`, `CECASEM_WITHDREW`, `OTHER`), estados ordinarios, reapertura, notas, archivos, derivaciones, traducciones ni lecturas. En reuniones siguen excluidos asistencia, acuerdos y cambios menores. Solo diferencias explícitas de fecha, zona, modalidad, enlace o ubicación producen MEETING_RESCHEDULED.

La [entrega original 4.5 P1](subfase-4.5-notificaciones-p1.md) conserva sus evidencias históricas y ahora contiene una nota trazable que identifica la audiencia vigente.

## Durabilidad, despliegue y datos anteriores

Se reutilizan Notification, NotificationDelivery, NotificationCheckpoint, centro, contador, endpoints y scheduler existentes. La nueva fuente usa `process-achieved` y advisory lock `(1128612691,48)`; Opportunities conserva clave 45, Meetings 46 y recordatorios 47. Cada fuente confirma una transacción independiente. El fallo de Processes no bloquea los lotes sanos de Opportunities/Meetings.

Cursor compuesto `(createdAt,id)`, límite superior finito, lotes de 25 y barridos repetidos recuperan commits tardíos. SAVEPOINT por evento confirma recibo y avisos juntos o revierte ambos y continúa. La audiencia se fija al primer procesamiento exitoso, incluido un recibo sin destinatarios. La unicidad PostgreSQL `(recipientUserId,sourceEventId,type)` impide duplicados después de reinicios o consumidores simultáneos.

No existe una frontera temporal oficial de adopción en la configuración o documentación del proyecto. En coherencia con el consumidor vigente, los hechos ACHIEVED confirmados existentes sin recibo pueden descubrirse y entregarse una sola vez. No se inventó una fecha de corte. Los recibos previos de oportunidades/reuniones no se eliminan ni recalculan para globalizar retroactivamente su audiencia.

Reabrir conserva el aviso del cierre anterior. Otro cierre ACHIEVED con un nuevo evento puede producir otro aviso: deduplicación por hecho, no por proceso para siempre. Ni la entrega ni su lectura cambian `lastActivityAt`, participantes, ReminderOccurrence, traducciones o historial formal.

## Integridad y migraciones

Dos migraciones nuevas, posteriores a las 52 existentes:

- `20261005080000_process_achieved_notification_type`: enum PROCESS_ACHIEVED.
- `20261005080001_process_notification_sources`: contexto processId, FKs e índices, constraints y triggers de procedencia.

NotificationDelivery vincula `(sourceEventId,processId)` a un evento real del mismo proceso, con eliminación/actualización RESTRICT. Su trigger exige CLOSED/CLOSED/ACHIEVED. Notification tiene FK al proceso y al recibo real. El contexto único debe coincidir con el tipo y el recibo. Procedencia y recibos son inmutables; `readAt` permanece mutable. Se mantienen las protecciones de oportunidades, reuniones e inactividad.

La cadena completa de 54 migraciones se desplegó desde cero. El upgrade 52→54 se probó con datos previos y comparación exacta de 20 tablas; al comparar Notification/Delivery solo se excluyó la nueva columna nullable processId. Se preservaron avisos, readAt, recibos, checkpoints, oportunidades, reuniones, recordatorios, traducciones y auditoría. Prisma validate/status/diff aprobados; sin diferencias de esquema y rol de aplicación no superusuario. SHA-256 de las 52 migration.sql originales: cero cambios.

## Deadlock: reproducción y grafo de locks

Antes de modificar locking se coordinó una edición real de Organization retenida antes de insertar DirectoryChange, mientras Opportunity retenía User y esperaba Organization. PostgreSQL rechazó Opportunity con SQLSTATE `40P01`.

Grafo previo:

- Opportunities: User FOR UPDATE → Organization FOR SHARE.
- Directory: gate compartido → jerarquía → Organization FOR UPDATE → FK de historial/auditoría a User FOR KEY SHARE.

FOR UPDATE bloqueaba el KEY SHARE requerido por la FK, formando el ciclo. `withLockedCredentials` ahora usa User FOR NO KEY UPDATE, con los mismos IDs ordenados y la lectura/revalidación de credenciales dentro de la transacción. Los casos de uso no modifican la PK. El nuevo lock sigue serializando cambios de contraseña, rol y actividad, y sigue siendo incompatible con FOR SHARE de selección de destinatarios; permite el KEY SHARE referencial del historial.

Directory puede terminar su historial/auditoría y liberar Organization; después Opportunity obtiene FOR SHARE, valida el recurso y confirma. No se añadieron sleeps, retries, timeouts mayores ni serialización global. El advisory de administración y la exclusión de Directory en cambios administrativos se mantienen.

La revisión cruzada incluyó creación/edición de Opportunity, procesos, comunicaciones, consolidación de organizaciones, Person y ContactMethod. Consolidation conserva gate exclusivo → jerarquía → actores ordenados → candidato → asociaciones/medios → historial/auditoría. People/Contacts comparten el patrón recurso → FK User; el modo compatible elimina el mismo borde hacia User sin alterar sus locks de recursos. No se requirieron cambios adicionales en esos módulos. Los locks de bootstrap quedan intactos.

Después del fix, el mismo reproductor confirmó ambas operaciones. Las pruebas de integración coordinan DirectoryHistory y DirectoryTarget para forzar el intercalado de servicios reales, tanto para crear como para editar Opportunity; comprueban versiones, cambios de nombre, eventos y auditoría atómica. El E2E HTTP también confirmó edición de Organization y creación de Opportunity concurrentes.

## API, interfaz y evidencias

Se conservan GET `/api/v1/me/notifications`, GET `/api/v1/me/notifications/unread-count` y PATCH `/api/v1/me/notifications/:id/read`. DTO mínimo `process:{id,purpose,context,occurredAt}`; otros contextos permanecen null. No expone sourceEventId, destinatarios o cuerpos de comunicaciones. Privacidad por sesión, 401 anónimo, 404 para aviso ajeno y Cache-Control no-store.

El centro muestra “Proceso concretado”, propósito, contexto y fecha del hecho, y navega al proceso. Se conserva navegación ante fallo de lectura, filtros, paginación y caché por identidad. Navegador QA: Directorio global abrió un aviso, vio proceso cerrado Concretado y contador 4→3; estado Leída persistido al volver. Vista móvil 390×844 sin desbordamiento horizontal. Capturas fuera del repositorio; ninguna credencial en archivos versionados.

Docker Compose config/build/startup aprobados con PostgreSQL/API/web aislados. HTTP confirmó usuarios de los cuatro roles, participantes formales, exclusión de actor y ajenos, globales sin participación, contador, lectura privada, reapertura/segundo cierre y reuniones globales con incorporación individual. Reinicio real de API y reprocesamientos conservaron los conteos de avisos/recibos.

## Revalidación

Lint, typecheck, pruebas raíz, build y diff check aprobados. Pruebas raíz: API **884/48 suites**, frontend **586/33 archivos**. La integración monolítica agotó heap de Node (exit 134). Esa primera ejecución usó la base del reproductor y también reveló contaminación de fixtures en asserts de conteos globales; no se usó como resultado aprobatorio. La regresión por grupos utilizó una base nueva, migrada y vacía, sin omisiones ni cambios de timeouts: **1.226 pruebas, 32 suites, cero fallos**. La suite específica de corrección contiene **18 pruebas**; además se agregaron 12 casos de política API y 4 casos frontend, y se actualizó la suite previa de reuniones a la matriz oficial.

Los grupos ejecutaron `corepack yarn workspace @cecasem-conecta/api test:integration --runTestsByPath` con los siguientes archivos bajo `apps/api/test`. Cada nombre listado tiene sufijo `.integration-spec.ts`:

| Grupo | Suites | Pruebas aprobadas | Manifiesto |
| --- | --- | --- | --- |
| 0 | 8 | 304 | auth, authorization, communication-amendments, contact-intents, contact-restrictions, contacts, database, directory-history |
| 8 | 8 | 285 | directory, duplicates, files, first-access, intent-conversion, meetings, notifications-p1, notifications |
| 16 | 8 | 297 | opportunities, password-reset, people, phase4-corrections, received-communications, referrals, relationship-context, relationship-processes |
| 24 | 8 | 340 | relationship-timeline, reminders, search, sent-communications, translations, users-administration, users, verification |

Comparación del manifiesto descubierto y los cuatro grupos: 32 archivos únicos, 32 ejecutados, cero diferencias. Las regresiones cubren autenticación, sesiones, RBAC, administración, directorio/consolidación, comunicaciones, relaciones, archivos, oportunidades, reuniones, recordatorios y traducción. El rol PostgreSQL de todas las validaciones de aplicación/migración fue `cecasem`, sin superusuario; solo la creación inicial de bases QA usó la cuenta administrativa del contenedor propio.

## Archivos de esta corrección y Git

20 archivos corresponden a esta tarea, separados de los 59 registros iniciales:

- Modelo/migraciones: schema.prisma y las dos nuevas migration.sql.
- Backend: notification-consumer.ts, notification-policy.ts, notification.dto.ts, notifications.module.ts, notifications.service.ts, relationship-processes.service.ts, users.service.ts.
- Pruebas API: notification-consumer.spec.ts, notification-policy.spec.ts, notifications.integration-spec.ts, notifications-p1.integration-spec.ts y phase4-corrections.integration-spec.ts.
- Frontend: contracts.ts, notifications-page.tsx y notifications-p1.test.tsx de la feature notifications.
- Documentación: subfase-4.5-notificaciones-p1.md y este informe.

Git final: main, mismo HEAD; 35 archivos modificados y 36 sin seguimiento contando archivos individuales. Nada staged. `git diff --check` exit 0. Sin commit ni push. No se versionan env reales, credenciales, datos runtime, logs ni capturas QA. Se conservaron los cambios previos; los archivos que se amplían para esta corrección mantienen la funcionalidad de 4.6/4.7. No se modificó yarn.lock ni se agregaron dependencias.

El entorno Docker QA propio se detiene después de validar, conservando sus volúmenes. Se revocan las sesiones y credenciales sintéticas, y se retiran los archivos externos que contienen secretos. Codex permanece abierto. Ambos P1 están corregidos y la audiencia está alineada para una segunda reauditoría independiente de Fase 4.

Observaciones P2 conservadas: VM Modules, aviso pg de consultas concurrentes sobre el mismo cliente, bundle Vite mayor de 500 kB, smoke LibreTranslate real pendiente y comportamiento Nginx al recrear solamente API. Esta tarea no modifica esos puntos.
