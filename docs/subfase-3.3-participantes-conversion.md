# Subfase 3.3 — Participantes y conversión de intenciones

## Baseline

Branch `main`, HEAD `b912383a0874e4519f3a27aade9a712da32f319c`.
Node v24.14.0 y Corepack/Yarn 4.18.1. Había 28 archivos pendientes de 3.2
(12 modificados y 16 nuevos); se conservaron. Sin cambios de dependencias,
lockfile, infraestructura o archivos de entorno.

El prompt 3.3 ratifica la regla provisional de cambio de estado de 3.2:
Búsqueda y Planificación requieren participación formal. La observación funcional
del informe histórico de 3.2 queda resuelta por esta decisión explícita.

## Participación y contrato público

Se mantiene ProcessParticipant y su PK `(processId,userId)`. El servicio
ProcessParticipationService se exporta desde RelationshipsModule. Su interfaz es
`ensureParticipant(processId,userId,origin,tx)`; la transacción es obligatoria.
Valida proceso, usuario existente/activo y origen. PROCESS_CREATOR exige que el
usuario sea el creador real. `createMany(skipDuplicates:true)` inserta con
ON CONFLICT DO NOTHING; nunca modifica el primer origen ni joinedAt.
El creador conserva la fecha de creación del proceso.

Orígenes admitidos: PROCESS_CREATOR, SENT_COMMUNICATION, RECEIVED_COMMUNICATION.
Los dos últimos forman parte del contrato público preparado para productores
formales; todavía no hay comunicaciones ni endpoints que los produzcan.
Las pruebas internas simulan esas actuaciones dentro de una transacción.

Productores permitidos: creación de proceso y, cuando existan en 3.5/3.6,
registro real de comunicación enviada/recibida. El productor debe autorizar al
actor vigente bajo el lock de UsersService antes de escribir, registrar la
actuación y llamar ensureParticipant en esa misma transacción. No debe abrir
una transacción separada para participación. Relaciones conserva la propiedad
de su persistencia; comunicaciones no debe escribir ProcessParticipant directamente.

Las consultas solo usan isParticipant, que no escribe. Las notas internas
futuras no son productores y no deben llamar ensureParticipant; INTERNAL_NOTE
no es un origen admitido. No existen alta/baja manual, endpoint POST participants,
propietario permanente, notas ficticias ni reuniones adelantadas.

## Autorización definitiva

| Acción | Administración | Directorio | Búsqueda | Planificación |
| --- | --- | --- | --- | --- |
| Consultar | Sí | Sí | Sí | Sí |
| Cambiar estado | Sí | Sí | Participante | Participante |
| Cerrar/reabrir | Excepcional auditado | Sí | Participante | Participante |
| Convertir intención propia | Sí | Sí | Sí | Sí |
| Convertir intención ajena | Sí | Sí | No | No |

Todos requieren sesión vigente, usuario activo y capability correspondiente.
Los servicios revalidan rol/actividad bajo lock, aun con una identidad obsoleta
del guard. La autorización consulta participación, sin sustituirla por autoría.
Un cambio de rol o desactivación conserva las filas y fechas históricas.
Administración/Directorio no adquieren participación por cambiar/cerrar/reabrir.

## Conversión

POST `/api/v1/contact-intents/:id/convert` requiere
`relationships.intent.convert`. El DTO solo recibe expectedVersion entero positivo.
Rechaza campos de autor, creador, propósito, actor, proceso, estado, participantes
y fechas; se reutilizan propósito y actor de la intención.

Con el usuario bloqueado y autorizado se bloquea ContactIntent FOR UPDATE,
se valida propiedad, estado ACTIVE, versión y ausencia de proceso vinculado.
DirectoryTargetService revalida la ficha actual. La misma transacción crea el
proceso PREPARATION/version 1, incorpora al conversor como participante creador,
registra evento CREATED y auditoría PROCESS_CREATED, cambia la intención a
CONVERTED incrementando versión/actividad y registra CONTACT_INTENT_CONVERTED.
Las dos auditorías comparten operationId. Una falla revierte todo.

La autoría de la intención permanece intacta; creador y participante inicial
del proceso son quien convierte. El autor original no obtiene participación
automática, incluso si tiene Búsqueda/Planificación. Puede consultar el historial.
También se permite que Administración convierta una intención cuyo autor esté inactivo.

Se conserva sourceIntentId con FK RESTRICT y UNIQUE de 3.2: 0..1 procesos por
intención. Estado, bloqueo y update condicional por versión serializan conversión
y cancelación. Dos conversiones producen un ganador y un 409; nunca dos procesos.
Las respuestas incluyen intent y process; la intención expone canConvert y processId.

## Frontend

El detalle activo muestra Convertir en proceso con capability y autorización
contextual del backend. La confirmación explica propósito/actor reutilizados y
autoría del conversor. Solo se envía expectedVersion. Se invalidan ambas familias
de queries y se navega al proceso creado. La intención convertida enlaza al proceso
y el listado permite filtrar CONVERTED. 403/409 conservan contexto y exigen revisar
el estado antes de reintentar. Respuestas tardías tras logout, cambio de rol o
capability no repueblan caché ni navegan.

El detalle de proceso diferencia creador y participante por comunicación enviada
o recibida; conserva visible la cuenta histórica inactiva. Sin UI de alta manual.

## Migraciones y revisión SQL

Dos migraciones nuevas, sin alterar las de 3.1/3.2:

- 20261003213000_participation_conversion_actions: dos orígenes formales y
  AuditAction CONTACT_INTENT_CONVERTED.
- 20261003213001_intent_conversion_audit: admite la nueva acción en el CHECK de
  auditoría y añade índice único parcial por intención para esa acción.

Se separa la adición del enum de su uso en CHECK/índice. El resto de familias y
condiciones de auditoría permanece idéntico. Las migraciones de 3.2 conservan sus
hashes del baseline. No se añaden tablas ni se cambia sourceIntentId.
Deploy/status aprobados en development y _test: 23 migraciones al día.
Prisma validate aprobado y diff datasource/schema en development vacío.
No se aplicaron migraciones al runtime institucional.

## Pruebas y validación

SUBFASE 3.3 COMPLETADA CON OBSERVACIONES (avisos de herramientas, sin bloqueo funcional).
Corepack yarn lint, typecheck, test y build aprobados en la ejecución final.
API: 29 suites/475 pruebas; frontend: 18 archivos/339 pruebas; PostgreSQL/HTTP:
17 suites/804 pruebas. Total: 1.618 pruebas, con 78 nuevas respecto de 3.2
(23 unitarias, 41 integración y 14 frontend). Prisma validate, migrate deploy/status,
diff datasource/schema, git diff --check y whitespace de archivos nuevos: OK.
Diff y rutas revisados; sin secretos, datos runtime ni cambios de dependencias.
Las pruebas cubren matriz contextual, autor distinto del conversor, origen y
fecha iniciales, idempotencia concurrente, historia tras rol/inactividad, DTO,
estados, versiones, conversión/cancelación concurrentes y rollback de proceso,
participante, evento, ambas auditorías y update condicional de intención.

En una ejecución general bajo carga, una prueba existente de paginación de
personas agotó su espera de Testing Library. La suite aislada aprobó sus 20
pruebas sin modificar el módulo. La repetición general aprobó los 339 casos.
Una prueba nueva de respuesta tardía se corrigió para esperar la limpieza
asíncrona del rol anterior antes de simular la respuesta.

Persisten avisos no bloqueantes: VM Modules experimental, deprecación pg de
consultas concurrentes y bundle Vite de 573,79 kB (gzip 163,11 kB), superior
al umbral de 500 kB. No se cambiaron umbrales ni configuraciones para ocultarlos.
La UI se validó con Testing Library; no se afirma prueba manual de navegador.

## Alcance y continuidad

SUBFASE 3.1 COMPLETADA: SÍ. Conversión implementada, atómica, autorizada,
concurrentemente segura, probada e integrada en frontend. No se implementaron 3.4/3.5,
comunicaciones, notas, timeline tipo chat, restricciones, reuniones, oportunidades,
archivos, notificaciones, correo, WebSockets ni recordatorios.
Las siguientes subfases deberán usar el contrato público transaccional solo
cuando registren una actuación formal real. No iniciar la siguiente subfase sin
su prompt. Commit realizado: NO. Push realizado: NO.

## Archivos de esta subfase

La siguiente lista separa los cambios incrementales de 3.3 de los 28 archivos
que ya estaban pendientes al comenzar. El estado Git acumulado también contiene
los cambios de 3.2; ambos conjuntos permanecen sin commit.

- `apps/api/prisma/migrations/20261003213000_participation_conversion_actions/migration.sql`
- `apps/api/prisma/migrations/20261003213001_intent_conversion_audit/migration.sql`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/modules/audit/audit.service.ts`
- `apps/api/src/modules/auth/authorization/authorization.spec.ts`
- `apps/api/src/modules/auth/authorization/permission.ts`
- `apps/api/src/modules/auth/authorization/role-permissions.ts`
- `apps/api/src/modules/relationships/contact-intent-error.filter.ts`
- `apps/api/src/modules/relationships/contact-intent.dto.ts`
- `apps/api/src/modules/relationships/contact-intent.rules.spec.ts`
- `apps/api/src/modules/relationships/contact-intent.rules.ts`
- `apps/api/src/modules/relationships/contact-intents.controller.ts`
- `apps/api/src/modules/relationships/contact-intents.service.ts`
- `apps/api/src/modules/relationships/process-participation.service.spec.ts`
- `apps/api/src/modules/relationships/process-participation.service.ts`
- `apps/api/src/modules/relationships/relationship-processes.authorization.spec.ts`
- `apps/api/src/modules/relationships/relationship-processes.service.ts`
- `apps/api/src/modules/relationships/relationships.module.ts`
- `apps/api/test/contact-intents.integration-spec.ts`
- `apps/api/test/intent-conversion.integration-spec.ts`
- `apps/api/test/relationship-processes.integration-spec.ts`
- `apps/web/src/features/relationships/contact-intent-detail-page.tsx`
- `apps/web/src/features/relationships/contact-intents-page.tsx`
- `apps/web/src/features/relationships/contact-intents.test.tsx`
- `apps/web/src/features/relationships/contracts.ts`
- `apps/web/src/features/relationships/process-contracts.ts`
- `apps/web/src/features/relationships/queries.ts`
- `apps/web/src/features/relationships/relationship-process-detail-page.tsx`
- `apps/web/src/features/relationships/relationship-processes.test.tsx`
- `apps/web/src/lib/api/client.ts`
- `docs/subfase-3.3-participantes-conversion.md`
