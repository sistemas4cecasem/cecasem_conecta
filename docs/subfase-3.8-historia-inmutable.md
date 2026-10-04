# Subfase 3.8 — Historia inmutable de comunicaciones

## Baseline y alcance

Entrada main, HEAD b912383: 128 archivos físicos pendientes. Se conserva el trabajo
anterior y no se hace commit/push. Se implementa exclusivamente 3.8 sobre SENT y
RECEIVED. InternalNote conserva su ausencia de edición/borrado ordinarios.
No se implementa restore, integración de correo, archivos ni Fase 4.

## Modelo e invariantes

CommunicationAmendment representa CORRECTION, ANNOTATION e INVALIDATION. Conserva
comunicación, autor, contenido original (máximo 5000 caracteres), fecha y clave/fingerprint
de solicitud. Los registros se agregan; ningún caso de uso público los sobrescribe.
No hay PATCH/PUT/DELETE del original ni de amendments.

La corrección documenta el error en texto libre sin sustituir campos. La observación
agrega contexto específico de esa comunicación. Invalidar crea un hecho histórico,
proyecta Communication.validity=INVALIDATED y cambia únicamente su versión de 1 a 2.
El original, dirección, sender, TO/CC/CCO, asunto, cuerpo, cuenta, fechas, snapshots,
registrador y claves originales permanecen intactos. La invalidación no se revierte.
En comunicación invalidada solo se admiten observaciones posteriores; corrección o
segunda invalidación devuelven 409. Un replay idéntico recupera el primer registro.

Crear amendments no otorga/elimina participación ni altera actividad, versión,
estado, cierre, eventos o responsable del proceso. Se permite documentar en cerrado
y bajo restricciones de contacto porque son actuaciones internas posteriores.

## Autorización

Capabilities nuevas: communications.amend y communications.invalidate en los cuatro
roles. Leer exige communications.read y relationships.process.read. El backend
revalida usuario activo y rol actual bajo el lock de credenciales existente.

| Acción | Administrador | Directorio | Búsqueda | Planificación |
|---|---|---|---|---|
| Corregir/observar propia o ajena | Sí | Sí | Sí | Sí |
| Invalidar propia | Sí | Sí | Sí | Sí |
| Invalidar ajena | Sí | Sí | No | No |

Propia significa registeredByUserId igual al actor, no creador ni participante.
No existe una regla autorizada adicional para Directorio; no se inventó una.
Usuarios/autorías inactivas siguen visibles, pero usuarios inactivos no actúan.

## API e idempotencia

- POST /api/v1/communications/:id/amendments: { type: CORRECTION|ANNOTATION, content }.
- POST /api/v1/communications/:id/invalidate: { reason }.
- GET /api/v1/communications/:id/amendments?page=1: páginas de 25, orden createdAt/id.

POST requiere Idempotency-Key UUID. Autor, fecha y comunicación los determina el
servidor. El DTO rechaza asignación de otros campos. Contenido solo espacios/NUL,
tipos inválidos o clave ausente: 400; inexistente: 404; sin autorización: 401/403;
clave con otro contenido o comunicación invalidada: 409.

Transacción: lock de credenciales, revalidación, lock de comunicación, consulta del
replay, regla de validez y append. Invalidación/proyección/auditoría se confirman
atómicamente. Clave única por autor y fingerprint de comunicación/tipo/contenido.
La fecha se fija después de esperar locks. Los reintentos no duplican hechos ni audit.

## Auditoría y migraciones

COMMUNICATION_INVALIDATED incluye actor, communicationId, processId y operationId
igual al amendmentId que conserva el motivo. No se duplica texto en AuditEvent.
Correcciones/observaciones conservan trazabilidad en su propia entidad; el patrón
actual de notas no exige una copia adicional en auditoría.

Se preservan las 30 migraciones anteriores. Nuevas, en este orden:

1. 20261004043000_amendment_enums: tipos y valores de enums.
2. 20261004043001_communication_amendments: tabla, índices/FKs RESTRICT, contenido
   no vacío, única invalidación por comunicación y versión coherente con validez.
3. 20261004043002_invalidation_audit: índice único por comunicación/acción y extensión
   del check de auditoría, conservando todas las familias anteriores.
4. 20261004043003_invalidation_consistency: constraints diferidas que requieren
   acuerdo entre estado INVALIDATED y existencia del hecho de invalidación al commit.

Contradicciones técnicas resueltas de forma mínima: el check anterior version=1
impedía la transición; la auditoría admitía un solo evento por comunicación e ignoraba
el nuevo action. Nuevas migraciones extienden esos invariantes sin editar las previas.
Las constraints diferidas permiten crear evento y proyección en la misma transacción
sin tolerar proyección sin hecho ni hecho con comunicación aún válida.

## Timeline, contexto y performance

El timeline agrega una cuarta fuente pública de Comunicaciones; no consume AuditEvent
ni crea una tabla visual. Nuevos kinds COMMUNICATION_CORRECTED, COMMUNICATION_ANNOTATED
 y COMMUNICATION_INVALIDATED usan createdAt, nunca occurredAt original. Desempate:
AMENDMENT < COMMUNICATION < EVENT < NOTE. Los cursores previos siguen válidos.

El item original conserva su fecha real y muestra INVALIDADA, motivo, actor y fecha;
la acción posterior aparece además cronológicamente y enlaza al original. No se
cargan cuerpos de correo. Cada fuente aplica el mismo keyset y límite N+1 dentro del
snapshot RepeatableRead; autores, destinatarios e invalidación se seleccionan por lotes.

Contexto 3.4 usa solo VALID: conteos, última fecha, indicador y recientes. Cuando todas
se invalidan indica que no hay comunicaciones válidas. Listado/historial/timeline
conservan todas con validez explícita. No se recalcula lastActivityAt ni participación.

La prueba existente de N+1 conserva la comparación antes/después del volumen y amplía
su techo de 12 a 16 SELECT por la cuarta fuente y relaciones de invalidación por lotes.
No escala el número de queries con el número de hechos. Nuevas pruebas incluyen
1000 amendments, paginación de 25 y consulta pura.

## Frontend

El detalle identifica Contenido original registrado y lista posterior paginada.
Corrección y observación tienen formularios distintos por significado. Invalidación
requiere motivo y checkbox de confirmación explícita. Se conservan borrador y clave
al reintentar el mismo contenido; al cambiarlo se genera otra clave. Sin restauración.

Permisos generales y autoría controlan acciones visibles, con backend autoritativo.
Invalidada muestra badge/motivo/autor/fecha en detalle y timeline; corrección e invalidar
se retiran, observación continúa disponible. HTML se representa como texto literal.

Mutaciones invalidan detalle/listas/amendments, contexto, timeline y procesos. Caché
por identidad/rol/capabilities; respuestas tardías no actualizan una identidad distinta.

## Preparación siguiente

Reauditoría final de Fase 3 y escenario E2E institucional completo. Las subfases de
entrada se conservan; completar 3.8 no declara FASE 3 COMPLETADA ni inicia Fase 4.

## Archivos de la subfase

37 archivos: 22 previamente pendientes modificados y 15 nuevos.

- `apps/api/prisma/schema.prisma`
- `apps/api/src/modules/audit/audit.service.ts`
- `apps/api/src/modules/auth/authorization/authorization.spec.ts`
- `apps/api/src/modules/auth/authorization/permission.ts`
- `apps/api/src/modules/auth/authorization/role-permissions.ts`
- `apps/api/prisma/migrations/20261004043000_amendment_enums/migration.sql`
- `apps/api/prisma/migrations/20261004043001_communication_amendments/migration.sql`
- `apps/api/prisma/migrations/20261004043002_invalidation_audit/migration.sql`
- `apps/api/prisma/migrations/20261004043003_invalidation_consistency/migration.sql`
- `apps/api/src/modules/communications/communication-amendment-error.filter.ts`
- `apps/api/src/modules/communications/communication-amendment.dto.ts`
- `apps/api/src/modules/communications/communication-amendment.rules.spec.ts`
- `apps/api/src/modules/communications/communication-amendment.rules.ts`
- `apps/api/src/modules/communications/communication-amendments.controller.ts`
- `apps/api/src/modules/communications/communication-amendments.service.ts`
- `apps/api/src/modules/communications/communication.dto.ts`
- `apps/api/src/modules/communications/communications.module.ts`
- `apps/api/src/modules/communications/communications.service.spec.ts`
- `apps/api/src/modules/communications/communications.service.ts`
- `apps/api/src/modules/relationships/relationship-timeline.service.ts`
- `apps/api/src/modules/relationships/timeline.dto.ts`
- `apps/api/src/modules/relationships/timeline.rules.ts`
- `apps/api/test/communication-amendments.integration-spec.ts`
- `apps/api/test/relationship-timeline.integration-spec.ts`
- `apps/web/src/features/communications/amendment-contracts.ts`
- `apps/web/src/features/communications/communication-amendments.test.tsx`
- `apps/web/src/features/communications/communication-amendments.tsx`
- `apps/web/src/features/communications/communication-detail-page.tsx`
- `apps/web/src/features/communications/communications-list.tsx`
- `apps/web/src/features/communications/contracts.ts`
- `apps/web/src/features/communications/queries.ts`
- `apps/web/src/features/relationships/relationship-context-panel.tsx`
- `apps/web/src/features/relationships/relationship-context.test.tsx`
- `apps/web/src/features/relationships/relationship-timeline.test.tsx`
- `apps/web/src/features/relationships/relationship-timeline.tsx`
- `apps/web/src/features/relationships/timeline-contracts.ts`
- `docs/subfase-3.8-historia-inmutable.md`

## Validación final ejecutada

- corepack yarn lint: aprobado.
- corepack yarn typecheck: aprobado.
- corepack yarn test: aprobado; API 586 pruebas/37 suites y frontend 474/24.
- corepack yarn build: aprobado. Advertencia no bloqueante de Vite por chunk de
  634.62 kB (174.16 kB gzip); no se amplió alcance con refactors de bundles.
- Integración PostgreSQL completa: 1028 pruebas aprobadas en 23 suites (282.07 s).
  Incluye 29 pruebas nuevas de amendments y las 27 de timeline/notas existentes.
- Pruebas seleccionadas frontend: 74 aprobadas en tres suites; 13 casos nuevos.
- Prisma validate: aprobado. migrate deploy/status: 34 migraciones aplicadas.
  migrate diff no detectó diferencias de esquema. Checksums de las 34 migraciones
  coinciden en las dos bases aisladas; las 30 anteriores permanecen intactas.
- git diff --check: aprobado. Revisión de SQL, diff, archivos sensibles y runtime:
  sin secretos ni archivos inesperados. Una revisión adicional de archivos nuevos
  señala una línea vacía final en el SQL de enums ya aplicado; se preserva su checksum
  y no tiene efecto funcional.

La primera selección PostgreSQL permitió detectar el check/índice anterior de audit
que impedía registrar invalidación; se corrigió mediante la nueva migración de auditoría.
Fixtures existentes se adaptaron al contrato ampliado sin retirar sus aserciones.
No se alteraron timeouts ni se ocultaron fallos mediante skips.
Las advertencias de pg sobre queries pendientes y VM Modules corresponden al tooling
actual. Los logs HTTP 500 esperados en pruebas de rollback no implican casos fallidos.
No se realizó revisión visual manual en navegador; los flujos fueron verificados con
pruebas de frontend y HTTP/PostgreSQL.

Estado final: main, HEAD b912383, 143 archivos físicos pendientes; 37 corresponden a
esta subfase (22 existentes y 15 nuevos). Sin cambios fuera del manifiesto de 3.8,
ningún archivo staged, ningún commit y ningún push.
