# Subfase 3.7 — Conversación institucional y notas internas

## Alcance y baseline

Entrada: main, HEAD b912383, 112 archivos pendientes de las subfases anteriores.
Se conserva ese trabajo. No se hace commit ni push ni se implementa 3.8.

La conversación es una proyección de hechos persistidos, no mensajería ni envío de
correo. Sus fuentes son Communication, RelationshipProcessEvent e InternalNote.
No se duplica información en una tabla TimelineItem ni se usa AuditEvent como fuente.

## API y contrato

- `GET /api/v1/relationship-processes/:id/timeline?pageSize=25&after=<cursor>`.
  Cursor opcional, página de 1–100 items, `Cache-Control: no-store`.
  Retorna `{ items, nextCursor }`, sin cargar todo el historial ni calcular conteos
  globales que la navegación no necesita.
- `POST /api/v1/relationship-processes/:id/notes`, body `{ body }`.
  Retorna el item INTERNAL_NOTE creado. Sin rutas ordinarias de editar/borrar.

Items discriminados: SENT_COMMUNICATION, RECEIVED_COMMUNICATION, PROCESS_CREATED,
PROCESS_STATE_CHANGED, PROCESS_CLOSED, PROCESS_REOPENED e INTERNAL_NOTE.
Campos comunes: id, kind, occurredAt, registeredAt, actor, summary y payload.
Payloads: comunicación con remitente/asunto/destinatarios originales y enlace por ID;
evento con estados/resultado/observación; nota con noteId y cuerpo original.

Leer requiere las capabilities existentes de proceso y comunicaciones, disponibles
en los cuatro roles. Agregar una nota usa `relationships.note.create`, concedida a
Administrador, Directorio, Búsqueda y Planificación. Guard y servicio revalidan
usuario activo y rol actual. No se requiere participación para leer o agregar notas.
Query/cursor inválido: 400; proceso inexistente: 404; acceso ausente: 401/403.

## Orden y cursor

Orden ascendente: fecha real, fecha de registro, fuente e ID. Fuentes de desempate:
COMMUNICATION < EVENT < NOTE. Comunicaciones usan occurredAt/createdAt; eventos y
notas usan createdAt para ambos instantes. IDs UUID se comparan en orden estable.

El cursor base64url incluye processId y la posición completa. Se valida estructura,
UUID, fechas y fuente; no puede reutilizarse para otro proceso. Es una posición de
lectura, no un token de autorización ni una copia del historial.

Cada propietario aplica el mismo keyset a su fuente y devuelve como máximo N+1
items. La proyección mezcla y limita a N, con un cursor si quedan items. No usa
offset ni carga todos los IDs del proceso. Cada página usa un snapshot RepeatableRead.

Nuevos items después del cursor aparecen al continuar; los insertados antes, incluidos
retrospectivos, se recuperan al actualizar desde el principio. No se promete congelar
un snapshot entre requests. La invalidación de TanStack Query recalcula las páginas
ya cargadas con los nuevos cursores; «Actualizar historial» permite revisión explícita.

## Límites de módulos y consultas

RelationshipTimelineModule importa Relaciones y Comunicaciones; evita invertir la
dependencia existente de Comunicaciones hacia Relaciones. El coordinador consume
los contratos públicos `timelineItems` de procesos, comunicaciones y notas, pasando
la misma transacción. Cada módulo consulta su propia persistencia.

Se seleccionan usuarios y destinatarios por lotes. Comunicaciones no selecciona
bodyOriginal. Cada resumen muestra hasta diez destinatarios, con recipientTotal y
enlace al detalle completo. Notas tienen máximo 5000 caracteres y se muestran como
texto literal. No hay una query por item, destinatario o autor.

Se reutilizan los índices de proceso/fecha/ID de comunicaciones y eventos. InternalNote
tiene índice compuesto `(processId, createdAt, id)` y otro para authorUserId/FK.
La revisión siguió las reglas de índices compuestos, FKs y paginación de la guía
supabase-postgres-best-practices. No se agregan índices especulativos a otras tablas.

## Notas e invariantes

Notas IMPLEMENTADAS como entidad distinta. Conservan id, proceso, autor, cuerpo
original y fecha de creación. El cuerpo obligatorio admite hasta 5000 caracteres;
se rechazan texto vacío/solo espacios y NUL. Una constraint PostgreSQL refuerza el
cuerpo no vacío; FKs RESTRICT conservan referencias históricas.

Son inmutables mediante los workflows ordinarios. Crear una nota, incluso en CLOSED:
no crea participante, no actualiza lastActivityAt, updatedAt o versión del proceso,
no cambia estado/cierre, no crea eventos de proceso y no genera auditoría funcional.
Su propio registro con autor/fecha preserva trazabilidad. Una nota no habilita cerrar
el proceso a Búsqueda/Planificación no participantes. No se exige ausencia de
restricciones de contacto para documentar contexto interno.

lastActivityAt actualmente se actualiza por gestión formal y comunicaciones. Una nota
es contexto interno y no debe alterar recordatorios de actividad de esa gestión.
createdAt se fija después de esperar credenciales/autorización, evitando que el
timestamp de inicio de una transacción coloque una nota después del cierre concurrente
en una posición cronológica anterior.

## Frontend

En el detalle del proceso, «Conversación / Historial» aparece antes de los listados
especializados anteriores. Estilos y rótulos distinguen ENVIADA, RECIBIDA, NOTA INTERNA
y eventos funcionales. Se muestran fecha real, registro, registrador/autor y snapshots;
el cuerpo completo de comunicaciones se consulta por su ruta existente.

Las notas explican: «Esta nota solo será visible dentro de CECASEM Conecta y no se
envía al contacto». No tienen remitente externo ni TO/CC/BCC. La interfaz conserva
el borrador ante error, evita doble envío pendiente y muestra texto literal seguro.
En cerrado siguen disponibles timeline/notas/registro RECEIVED; SENT continúa oculto
y protegido por su regla de 3.5. No se incorpora una interfaz de mensajería.

Caché separada por identidad, rol y capabilities. Se cancela/retira al perder acceso.
SENT, RECEIVED, nota y mutaciones de estado/cierre/reapertura invalidan el timeline.
Las páginas conservan hechos cargados ante fallo de «Cargar más» y permiten reintentar.

## Migración

`20261004033000_internal_notes`: una tabla, dos FKs RESTRICT, dos índices y check
de cuerpo. Generada con Prisma migrate diff, inspeccionada y aplicada únicamente
en las bases aisladas de desarrollo y test. Las 29 migraciones anteriores se preservan.
No se agrega tabla de timeline, enums visuales persistidos ni estados de corrección.

## Cobertura

Unitarias: cursor asociado al proceso, cursor malformado, orden por fecha real,
desempate, posición de eventos frente a registro retrospectivo y validación de notas.
PostgreSQL/HTTP: cuatro roles, no participación, abierto/cerrado, nota obligatoria,
sin edición/borrado, cambios de estado, SENT/RECEIVED con snapshots, cierre previo,
respuesta tardía, nota, reapertura, retrospectivos, pureza y cursor entre fuentes.

La secuencia clave usa octubre de 2000 para que las fechas de comunicación no sean
futuras: 01 creación, 02 SENT, 04 cierre, 05 RECEIVED/nota, 06 reapertura; al registrar
un hecho del 03 se intercala entre SENT y cierre. Solo la preparación de fixtures
ajusta timestamps históricos; ningún workflow de la aplicación reescribe esos hechos.

Volumen: 1000 notas y 1000 comunicaciones, respuestas paginadas y número constante
de SELECT, sin cuerpos de correo. Concurrencia: una nota que espera credenciales
se registra después del cierre ocurrido mientras esperaba y no reabre el proceso.

Frontend: tipos/orden, HTML literal, enlaces, cargar más, errores/reintentos, vacío,
loading, usuario no participante que agrega nota, cerrado sin SENT, invalidaciones,
permisos y respuesta tardía después de retirar identidad.

## Siguiente subfase

3.8 deberá definir correcciones, anotaciones e invalidaciones explícitas conservando
originales, permisos, motivos, autor/fecha y su representación trazable en el timeline.
No están implementadas en esta entrega.

## Archivos de esta subfase

28 archivos: 12 previamente pendientes modificados y 16 nuevos. Los demás cambios
pendientes pertenecen al baseline y se conservaron sin modificaciones de esta subfase.

- `apps/api/prisma/schema.prisma`
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/auth/authorization/authorization.spec.ts`
- `apps/api/src/modules/auth/authorization/permission.ts`
- `apps/api/src/modules/auth/authorization/role-permissions.ts`
- `apps/api/src/modules/relationships/relationships.module.ts`
- `apps/web/src/app/layout/authenticated-layout.tsx`
- `apps/api/prisma/migrations/20261004033000_internal_notes/migration.sql`
- `apps/api/src/modules/communications/communications.service.ts`
- `apps/api/src/modules/relationships/internal-notes.controller.ts`
- `apps/api/src/modules/relationships/internal-notes.service.ts`
- `apps/api/src/modules/relationships/relationship-processes.service.ts`
- `apps/api/src/modules/relationships/relationship-timeline.controller.ts`
- `apps/api/src/modules/relationships/relationship-timeline.module.ts`
- `apps/api/src/modules/relationships/relationship-timeline.service.ts`
- `apps/api/src/modules/relationships/timeline-error.filter.ts`
- `apps/api/src/modules/relationships/timeline.dto.ts`
- `apps/api/src/modules/relationships/timeline.rules.spec.ts`
- `apps/api/src/modules/relationships/timeline.rules.ts`
- `apps/api/test/relationship-timeline.integration-spec.ts`
- `apps/web/src/features/communications/queries.ts`
- `apps/web/src/features/relationships/process-queries.ts`
- `apps/web/src/features/relationships/relationship-process-detail-page.tsx`
- `apps/web/src/features/relationships/relationship-timeline.test.tsx`
- `apps/web/src/features/relationships/relationship-timeline.tsx`
- `apps/web/src/features/relationships/timeline-contracts.ts`
- `apps/web/src/features/relationships/timeline-queries.ts`
- `docs/subfase-3.7-timeline-notas.md`

## Validación final ejecutada

- `corepack yarn lint`: aprobado.
- `corepack yarn typecheck`: aprobado.
- `corepack yarn test`: aprobado, 570 API y 461 frontend en la corrida global.
  Después del último caso adicional de cursor malformado, la API completa se repitió:
  571 pruebas aprobadas en 36 suites. Frontend: 461 en 23 suites.
- `corepack yarn build`: aprobado. Advertencia no bloqueante de Vite por chunk
  principal de 627.83 kB (172.80 kB gzip); no se amplió alcance con refactors de bundles.
- Integración PostgreSQL completa: 999 pruebas aprobadas en 22 suites;
  incluye las 27 pruebas nuevas de timeline/notas y concurrencia.
- Prisma validate: aprobado. 30 migraciones aplicadas en desarrollo y test aislados;
  migrate diff de desarrollo no detectó diferencias de esquema.
- Revisión SQL, diff, whitespace, rutas de ejecución y patrones de secretos:
  sin hallazgos. 29 migraciones anteriores sin cambios.

La primera corrida global frontend tuvo un timeout de cinco segundos en una prueba
previa de reintento de comunicación recibida mientras corría la integración completa.
La selección de suites y la repetición global sin esa carga simultánea aprobaron.
No se modificaron tests anteriores ni sus timeouts para ocultar el fallo.
No se realizó una revisión visual manual en navegador; el flujo se verificó mediante
pruebas de frontend y HTTP/PostgreSQL.

Estado Git: main, HEAD b912383, 128 archivos físicos pendientes en total;
28 tocados por esta subfase. Sin archivos staged, commit ni push.
