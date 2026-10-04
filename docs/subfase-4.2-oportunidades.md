# Subfase 4.2 — Oportunidades

## Resultado y baseline

Implementación completa sobre `main`, HEAD `fcafde0b6628f17cc8aeb62f753a13d67b2cb858`, correspondiente al cierre de archivos privados 4.1. El árbol inicial estaba limpio. Esta subfase no incluye commit ni push.

## Modelo y reglas

`Opportunity` conserva UUID, nombre, descripción, enlace HTTP/HTTPS, requisitos, fecha límite opcional, autor, fechas, versión y comando de creación idempotente. `OpportunityOrganization` representa la asociación M:N con organizaciones reales; `OpportunityEvent` conserva los hechos propios del módulo. No existe eliminación ordinaria.

El estado inicial es `PENDING_REVIEW`. Las únicas transiciones son:

- `PENDING_REVIEW → PREPARING → SUBMITTED → FINISHED`.
- `PENDING_REVIEW → DISCARDED` y `PREPARING → DISCARDED`.

No se admite retroceso, reapertura ni descarte de una oportunidad postulada. Descartar requiere un motivo significativo, de hasta 5.000 caracteres. Finalizar admite un resultado contextual opcional en texto de hasta 5.000 caracteres, sin inventar un catálogo. El motivo y el resultado finales no tienen edición ordinaria. Los campos descriptivos siguen siendo corregibles con historial incluso en estados terminales.

La fecha límite es una **fecha civil `YYYY-MM-DD`**, persistida como PostgreSQL `DATE`. No contiene hora ni zona horaria. Se admiten fechas vencidas, sin cambios automáticos de estado. Nombre: 300 caracteres; descripción/requisitos: 10.000 cada uno; enlace normalizado: 2.048, sin credenciales. Se rechazan controles en nombres antes de llegar a SQL.

Se requiere entre una y cien organizaciones por solicitud. Cien es un límite técnico de entrada para acotar consultas y payload, no un límite acumulado de oportunidades por organización. Las nuevas asociaciones deben apuntar a organizaciones activas sin consolidar. Se pueden conservar asociaciones históricas que posteriormente quedaron inactivas o consolidadas. Identificadores repetidos se rechazan; nunca se fusionan fichas automáticamente.

## Origen institucional

El origen admite proceso, comunicación, ambos o ninguno para investigación/referencia independiente. La creación contextual desde una comunicación conserva su proceso; desde un proceso conserva solo ese proceso. Si existen ambos identificadores, la comunicación debe pertenecer al proceso. Hay FKs reales y una FK compuesta adicional para esa coherencia.

El origen, creador, fecha original, clave y fingerprint quedan inmutables. No hay unicidad sobre `communicationId`: una comunicación puede originar varias oportunidades legítimas. La única ampliación de `Communication` es la relación inversa y un índice único compuesto sobre su identidad/proceso, sin reescribir cuerpos, fechas, snapshots ni fingerprints.

Crear o modificar oportunidades no cambia estado, versión, `lastActivityAt` ni participantes del proceso. La creación no convierte al actor en participante formal. Las interfaces de Directorio, procesos y comunicaciones se consultan mediante servicios públicos del módulo propietario.

## Autorización

| Rol activo | Leer | Crear | Editar | Estado | Descartar | Finalizar | Archivos privados |
|---|---|---|---|---|---|---|---|
| Administrador | Sí | Sí | Sí | Sí | Sí | Sí | Leer/cargar |
| Directorio | Sí | Sí | Sí | Sí | Sí | Sí | Leer/cargar |
| Búsqueda | Sí | Sí | Sí | Sí | Sí | Sí | Leer/cargar |
| Planificación | Sí | Sí | Sí | Sí | Sí | Sí | Leer/cargar |

Son permisos institucionales, también sobre oportunidades creadas por otra persona. El backend revalida identidad activa y rol. Los guards HTTP no reemplazan la política del servicio. Las mutaciones utilizan el bloqueo de credenciales existente y bloqueo de la oportunidad. Se conserva la revocación de sesiones y el rechazo de usuarios inactivos. No se alteraron las excepciones de cierre/reapertura de procesos.

## Historial, auditoría y concurrencia

Hechos propios: `CREATED`, `UPDATED`, `STATUS_CHANGED`, `DISCARDED`, `FINISHED`. Ediciones registran valores anteriores/nuevos, incluidos identificadores y nombres históricos de organizaciones. Los adjuntos se integran desde los lotes de 4.1 como `FILES_ATTACHED`, con autor, fecha y nombres originales. El historial combina ambos orígenes, con orden estable y cursor por fecha/origen/UUID; no utiliza una tabla genérica polimórfica.

Cada mutación persistente crea historial y `AuditEvent` en la misma transacción. La auditoría tiene FK real y única al hecho, operación y actor coherentes, y CHECKs compatibles con todas las acciones anteriores. Las ediciones que no cambian nada no incrementan versión ni crean hechos vacíos. Fallar la auditoría revierte oportunidad, asociaciones y hechos.

La creación exige `Idempotency-Key` UUID. La huella canoniza texto, fecha, organizaciones y origen. Misma clave/actor/contenido reutiliza el registro; otra carga produce 409. PATCH y cambios de estado requieren `expectedVersion`, bloqueo de fila y actualización condicionada. Una operación concurrente con versión vieja devuelve `VERSION_CONFLICT` sin sobrescribir ni auditar un cambio que no ocurrió.

El frontend conserva borradores ante 409, permite recargar la ficha sin perderlos y exige revisar la versión actual antes de volver a confirmar. Las respuestas de oportunidades y archivos se descartan si cambió la identidad; se cancelan y retiran sus cachés.

## Archivos y límites

Se extendió el módulo 4.1 con `FileUpload.opportunityId`, FK real y selección exclusiva de proceso/comunicación/oportunidad. Se reutilizan `FileStorage`, almacenamiento local privado, staging, validación de extensión/MIME/contenido, SHA-256, compensación, idempotencia, auditoría, listados y descarga autorizada. No hay otro sistema de almacenamiento ni nuevas URLs estáticas.

Máximo vigente: 20 MiB por archivo y diez archivos por solicitud, con allowlist existente. Las oportunidades descartadas/finalizadas rechazan cargas nuevas, conservando consulta/descarga. Reintentar una carga ya confirmada conserva la idempotencia aun después del descarte. Los archivos no modifican participantes ni actividad del proceso.

## API y frontend

Base `/api/v1`:

- `POST /opportunities`.
- `GET /opportunities`: paginación, estado, organización, proceso y comunicación; máximo 100 filas por página, orden fecha/UUID estable y relaciones consultadas en lote.
- `GET /opportunities/:id`.
- `PATCH /opportunities/:id`.
- `POST /opportunities/:id/state`.
- `POST /opportunities/:id/discard`.
- `GET /opportunities/:id/history`: cursor y tamaño acotado.
- `POST /opportunities/:id/attachments`.
- `GET /opportunities/:id/attachments`.
- Se reutilizan `GET /files/:id` y `GET /files/:id/download`.

Rutas web `/opportunities`, `/opportunities/new`, `/opportunities/:id`. Incluyen estados de carga/error/vacío, filtro, formularios RHF/Zod, organizaciones múltiples, fecha civil, origen navegable, edición trazable, acciones de estado/descarte/resultado, historial y panel de archivos existente. Procesos y comunicaciones tienen enlaces contextuales para crear oportunidades. No hay formularios para reescribir origen ni acciones de eliminación.

## Frontera pública para 4.5

`OpportunitiesService.recordedActivity(after?, limit)` ofrece un contrato interno tipado y paginado de hechos confirmados: creación, cambio de estado, descarte y finalización. Devuelve UUID de hecho/oportunidad/actor, fechas, estados y nombre actual; excluye ediciones descriptivas. No expone tablas a futuros consumidores ni ejecuta callbacks antes de commit.

Es un contrato de lectura de hechos, no una cola ni una garantía de entrega. La implementación de 4.5 definirá consumo, checkpoint, deduplicación por UUID y tratamiento de confirmaciones concurrentes fuera de orden. En 4.2 no se implementan Notification, scheduler, outbox, event bus, colas ni envíos de correo. La notificación P0 de Planificación pertenece a 4.5 y no es un pendiente de 4.2.

## Migraciones

Se agregan, sin modificar las 37 históricas:

- `20261004180000_opportunity_actions`: amplía `AuditAction` en una migración separada antes de usarlo en CHECKs.
- `20261004180001_opportunities`: tipos/tablas/FKs/índices, M:N única, versión, nombre, huella, motivo, resultado, ciclo de hechos, FK compuesta de origen, protección del origen/hechos, destino exclusivo de archivos y coherencia de auditoría.

Las 39 migraciones se validaron en PostgreSQL de pruebas existente y desde cero en Docker. También se ejecutó deploy desde cero con la cuenta de aplicación sin privilegios de superusuario en `cecasem_opportunities42_fresh_test`.

## Validaciones y evidencia — 2026-10-04

| Validación | Resultado |
|---|---|
| `corepack yarn lint` | Aprobado, sin errores ni avisos ESLint. |
| `corepack yarn typecheck` | Aprobado API/web. |
| `corepack yarn test` y revalidación API | API 691 pruebas, 40 suites; web 500 pruebas, 26 suites. |
| API `test:integration` sobre base aislada `_test` | 1.065 pruebas, 25 suites, aprobadas. |
| Pruebas específicas 4.2 | 49 de reglas, 16 de PostgreSQL/HTTP/servicios/archivos y 14 de frontend: 79. |
| `corepack yarn build` | API/web aprobados; aviso Vite por chunk principal de aproximadamente 669 kB. |
| Prisma `prisma:validate` | Schema válido. |
| Prisma `migrate diff` entre base y schema | Migración vacía: sin divergencia, incluida la FK compuesta declarada explícitamente en Prisma. |
| Prisma `prisma:migrate:deploy` / `prisma:migrate:status` | 39 migraciones aplicadas; schema actualizado. |
| `docker compose --env-file .env.example config --quiet` | Aprobado. |
| Docker build API/web | Imágenes construidas correctamente. |
| Docker startup y flujo HTTP/navegador | Proyecto aislado `cecasem_opportunities42_audit`, puerto 18082, db/api/web saludables. |
| `git diff --check` y revisión de archivos nuevos | Sin errores de whitespace ni secretos/runtime en el cambio. |

Las pruebas PostgreSQL cubren roles, creación idempotente concurrente, payload distinto, estados concurrentes, descarte contra edición, rollback de auditoría, M:N, versiones, origen, inmutabilidad y adjuntos tras descarte. La regresión completa conserva archivos 4.1, comunicaciones originales, procesos/participantes y las fases previas.

El navegador verificó creación desde comunicación con ambos antecedentes, organización precargada, fecha civil, edición e historial, preparación/postulación/finalización y descarte con motivo. Se cargaron dos adjuntos por Nginx, uno de exactamente 20 MiB. Después de recrear API/web con las imágenes finales se repitieron la descarga y las verificaciones de tamaño/SHA-256, conservándose los dos archivos. HTTP verificó tamaños/SHA-256, headers privados, 401 anónimo, 409 para nuevas cargas tras finalización y 413 con un byte adicional. La fecha vencida siguió pendiente hasta un descarte explícito. La vista móvil de 390×844 no presentó desbordamiento horizontal.

La evidencia visual se conserva fuera del repositorio, en la carpeta de visualizaciones de este chat. El entorno Docker de prueba utilizó volúmenes separados. Al terminar se desactivó la cuenta sintética, se revocaron sus sesiones, se retiraron credenciales/archivos temporales y se detuvieron únicamente sus contenedores, conservando los volúmenes sin `down -v`. Los contenedores de trabajo preexistentes no se modificaron.

## Observaciones y cierre

No hay pendientes funcionales conocidos de 4.2. Persisten avisos técnicos no bloqueantes ya presentes: chunk Vite >500 kB, VM Modules experimental en Jest y advertencia de pg sobre consultas concurrentes. No se alteraron límites globales de tiempo ni se ocultaron avisos. No se agregaron dependencias ni cambios de infraestructura de producción.

La subfase puede cerrarse. Queda preparada la frontera pública para la entrega P0 posterior de 4.5. No se inició otra subfase y no se hizo commit/push.

## Inventario de cambios

### Backend

- `apps/api/prisma/schema.prisma`
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/audit/audit.service.ts`
- `apps/api/src/modules/auth/authorization/authorization.spec.ts`
- `apps/api/src/modules/auth/authorization/permission.ts`
- `apps/api/src/modules/auth/authorization/role-permissions.ts`
- `apps/api/src/modules/communications/communications.service.ts`
- `apps/api/src/modules/directory/directory-target.service.ts`
- `apps/api/src/modules/files/file-error.filter.ts`
- `apps/api/src/modules/files/file-errors.ts`
- `apps/api/src/modules/files/file-upload.interceptor.ts`
- `apps/api/src/modules/files/files.controller.ts`
- `apps/api/src/modules/files/files.dto.ts`
- `apps/api/src/modules/files/files.module.ts`
- `apps/api/src/modules/files/files.service.ts`
- `apps/api/src/modules/relationships/relationship-processes.service.ts`
- `apps/api/test/password-reset.integration-spec.ts`
- `apps/api/src/modules/opportunities/opportunities.controller.ts`
- `apps/api/src/modules/opportunities/opportunities.module.ts`
- `apps/api/src/modules/opportunities/opportunities.service.ts`
- `apps/api/src/modules/opportunities/opportunity-error.filter.ts`
- `apps/api/src/modules/opportunities/opportunity-history.module.ts`
- `apps/api/src/modules/opportunities/opportunity.dto.ts`
- `apps/api/src/modules/opportunities/opportunity.rules.spec.ts`
- `apps/api/src/modules/opportunities/opportunity.rules.ts`
- `apps/api/test/opportunities.integration-spec.ts`

### Frontend

- `apps/web/src/app/layout/authenticated-layout.tsx`
- `apps/web/src/app/router/app-routes.tsx`
- `apps/web/src/app/router/navigation.ts`
- `apps/web/src/features/communications/communication-detail-page.tsx`
- `apps/web/src/features/communications/queries.ts`
- `apps/web/src/features/directory/directory-ui.tsx`
- `apps/web/src/features/directory/target-picker.tsx`
- `apps/web/src/features/files/attachments.tsx`
- `apps/web/src/features/files/contracts.ts`
- `apps/web/src/features/files/queries.ts`
- `apps/web/src/features/relationships/relationship-process-detail-page.tsx`
- `apps/web/src/lib/api/client.ts`
- `apps/web/src/features/opportunities/contracts.ts`
- `apps/web/src/features/opportunities/opportunities-pages.test.tsx`
- `apps/web/src/features/opportunities/opportunities-pages.tsx`
- `apps/web/src/features/opportunities/queries.ts`

### Migraciones

- `apps/api/prisma/migrations/20261004180000_opportunity_actions/migration.sql`
- `apps/api/prisma/migrations/20261004180001_opportunities/migration.sql`

### Documentación

- `docs/subfase-4.2-oportunidades.md`
