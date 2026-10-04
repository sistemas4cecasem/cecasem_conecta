# Subfase 4.1 — Archivos privados

Implementación de procesos y comunicaciones SENT/RECEIVED. Baseline: rama `main`, HEAD `12543abe61efd0e9d39bada1c46a6dc18f7bba1d`, árbol inicialmente limpio. No commit ni push. No se agregaron dependencias ni modelos de fases futuras.

## Contrato y configuración

`FileStorage` separa recepción temporal, lectura para validación, confirmación, eliminación técnica, descarga e identificación de candidatos huérfanos. `LocalFileStorage` utiliza claves UUID v4 generadas por servidor en `staging/` y `objects/`; el nombre original nunca determina una ruta. PostgreSQL almacena metadata, no bytes.

`FileUpload` conserva el recurso exclusivo, autor, fecha, clave/fingerprint idempotente y auditoría. `FileAttachment` conserva UUID público, clave interna privada, nombre original, MIME declarado y aceptado, tamaño real, SHA-256 y posición. Las FKs a proceso/comunicación/usuario/lote y auditoría son RESTRICT. El DTO expone autor/fecha del lote y distingue `PROCESS_ATTACHMENT` de `LATER_COMMUNICATION_ATTACHMENT`.

| Variable | Comportamiento |
| --- | --- |
| `FILE_STORAGE_ROOT` | Ruta absoluta privada. Sin definir: `storage/private` bajo el cwd de API, resuelta a absoluta. Docker: `/app/storage/private`. |
| `FILE_MAX_BYTES` | Por archivo, inicialmente **20.971.520 bytes = 20 MiB**. Configuración entera entre 1 y 20.971.520. |
| Cantidad | Máximo 10 archivos por solicitud; sin límite acumulado por recurso. |

La allowlist está centralizada en `file-validation.ts`: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, CSV, PNG, JPG/JPEG y WEBP. Se contrasta extensión/MIME con firmas y estructura; no basta el Content-Type del cliente. Se aceptan octet-stream y CSV declarado como text/plain cuando el contenido valida. TXT/CSV requieren UTF-8, sin controles binarios ni patrones evidentes de HTML/script activo. OOXML requiere entradas propias de su formato y Content Types, con lectura acotada y sin extracción; rechaza macros, ActiveX, nombres peligrosos y cifrado. Office legado exige CFB y un stream de su tipo en el primer sector del directorio. La inspección es conservadora: un documento legado atípico puede ser rechazado. No es una validación exhaustiva de documentos ni antivirus.

RF-72 queda preparado por configuración de despliegue; no se expone mutación ni pantalla administrativa en esta subfase. Cambiar el máximo por encima de 20 MiB requerirá revisar también CHECK SQL y Nginx. Una futura configuración administrativa deberá ser exclusiva de Administrador y auditable.

## API

Todas las rutas están bajo `/api/v1`, con sesión HttpOnly revocable y guards globales existentes.

| Método | Ruta | Contrato |
| --- | --- | --- |
| GET | `/files/config` | Límites públicos a usuarios autenticados con permiso de lectura. |
| POST | `/relationship-processes/:id/attachments` | Multipart `files`, 1–10 archivos, `Idempotency-Key` UUID obligatorio. |
| GET | `/relationship-processes/:id/attachments` | Listado paginado, `page=1`, `pageSize=25` (máximo 100). |
| POST | `/communications/:id/attachments` | Mismo multipart/idempotencia; incorporación posterior. |
| GET | `/communications/:id/attachments` | Listado paginado. |
| GET | `/files/:id` | Metadata autorizada sin clave ni ruta física. |
| GET | `/files/:id/download` | Stream autorizado, attachment RFC 5987, nosniff, private/no-store. |

Los cuatro roles vigentes tienen `files.read` y `files.upload`. El caso de uso vuelve a comprobar usuario activo y permisos de proceso/comunicación, además del recurso real. Actualmente estos roles tienen acceso institucional compartido; no se inventó una ACL por creador. Un UUID desconocido devuelve 404; no hay endpoint de borrado ordinario. Errores de carga/tipo: 400, tamaño: 413, conflicto/estado: 409, permisos: 403, bytes ausentes/corruptos: 503, sesión ausente/revocada/inactiva: 401 por el guard.

## Historia y concurrencia

Un adjunto de comunicación es un hecho posterior con autor/fecha propios. No se modifica cuerpo, destinatarios, snapshot/fingerprint, participación formal ni actividad/versión del proceso. El timeline agrega `FILES_ATTACHED` mediante la proyección del módulo propietario; no hay tabla genérica ni ciclo de módulos.

Una comunicación INVALIDATED conserva listado/descarga histórica y bloquea nuevas cargas. Un proceso CLOSED conserva historia y bloquea cargas directas. Una comunicación válida, incluida una respuesta tardía registrada conforme a las reglas existentes, admite adjuntos aunque su proceso esté cerrado.

Antes de recibir se autorizan actor/recurso/clave. La recepción no mantiene una transacción DB abierta. Después de validar y finalizar bytes, se bloquean credenciales del actor y el recurso a través de servicios propietarios y se revalidan permisos/estado. Metadata, lote y auditoría se confirman juntos. La unicidad por autor/Idempotency-Key y el fingerprint de recurso/archivos ordenados serializan retry concurrente; contenido diferente devuelve 409. Un retry ya confirmado puede recuperar el resultado aunque el recurso haya cambiado de estado. No existe deduplicación global por hash.

## Filesystem y atomicidad

Se valida cada componente de la raíz y subdirectorios con lstat/realpath, rechazando symlinks/junctions y escapes. Aperturas exclusivas y O_NOFOLLOW donde la plataforma lo soporta. Directorios nuevos 700; archivos 600 en Linux. Se cuenta y calcula SHA-256 durante el stream; se comprueba nuevamente antes de guardar metadata y antes de descargar.

La confirmación usa fsync del archivo y hard link exclusivo dentro del mismo volumen seguido de unlink del temporal. Los bytes existen antes de la metadata descargable. Si DB/auditoría falla se retiran solo objetos recién creados sin referencia confirmada. Ante resultado de commit ambiguo o DB inaccesible se conservan bytes para reconciliar, evitando destruir un archivo confirmado. Una caída entre pasos puede dejar huérfanos técnicos; DB/filesystem no constituyen una transacción distribuida.

`FilesService.reconcile(olderThan, remove=false)` identifica candidatos regulares con claves internas válidas, anteriores al umbral y sin referencia DB. Exige una antigüedad mínima de 24 horas y excluye claves en recepción/confirmación en la instancia. No tiene cron ni endpoint público. Para limpieza:

1. Detener nuevas cargas y todas las instancias que puedan escribir el volumen.
2. Conservar DB y volumen disponibles para un contexto de mantenimiento.
3. Invocar primero `reconcile(umbral)` y revisar candidatos.
4. Solo después invocar `reconcile(umbral, true)` con cargas detenidas.

Un operador puede resolver `FilesService` desde un contexto Nest `NestFactory.createApplicationContext(AppModule)` con la configuración habitual y cerrarlo en finally. No borra metadata ni bytes vinculados, ni archivos históricos por antigüedad. No se debe usar remove durante cargas activas. No hay scheduler automático.

## Migraciones

Se agregaron, sin modificar las 34 históricas:

- `20261004130000_file_audit_action`: acción enum separada antes de usarla en CHECKs.
- `20261004130001_private_files`: tablas, índices, FKs, checks de destino/tamaño/hash/clave/nombre/posición/MIME y extensión compatible de la familia de auditoría.
- `20261004130002_file_audit_required_operation`: rechaza operationId NULL en FILES_ATTACHED, evitando la semántica nullable de CHECK.

Las 37 migraciones se aplicaron en PostgreSQL de pruebas existente y en una base Docker nueva aislada. Prisma validate y migrate status aprobaron. Auditoría de archivos requiere referencia real a lote y operación; eventos anteriores requieren fileUploadId NULL.

## Frontend y Docker

Paneles en detalle de proceso y comunicación: selección múltiple, tamaño/nombre, límites cargados desde API, estados pending/error/vacío, autor/fecha, paginación, mensajes de incorporación posterior y bloqueo de carga por estado. Cliente API soporta blob preservando JSON, cookies y eventos 401. Caché por identidad/permisos; respuestas tardías no repueblan datos ni entregan bytes después de cambiar identidad. URLs blob se revocan. Se verificó carga múltiple real en navegador y vista móvil de 390×844, sin desbordamiento horizontal; el enlace nativo #adjuntos desplaza al panel.

El Compose principal monta `private_files` únicamente en API. La imagen prepara la ruta predeterminada con propietario node y modo 700 antes de USER node. Si se configura otra raíz, el operador debe preparar permisos equivalentes en el volumen; no se ejecuta chown como root durante la aplicación. Nginx no monta ni sirve los archivos; `/api/` permite `client_max_body_size 210m` para 10×20 MiB más overhead. El backend conserva el límite individual. `.gitignore` y `.dockerignore` excluyen bytes de runtime.

La validación Docker usó el proyecto separado `cecasem_files41_audit`, sin tocar los contenedores existentes del usuario. Se aplicaron migraciones desde el stage build, levantaron db/api/web saludables y cargaron dos archivos por Nginx, uno exactamente de 20 MiB. Se verificaron hashes/longitudes/headers/401 anónimo y ausencia de bytes en una ruta estática construida con la storageKey real. Se recrearon API y web dos veces, incluida la imagen final, y se repitió la descarga y hash con éxito. Se comprobó uid/gid 1000(node), directorios 700 y volumen persistente. Los volúmenes de auditoría se conservan; no se ejecutó down -v.

## Validaciones de cierre — 2026-10-04

Yarn 4.18.1 mediante Corepack, Node 24.14.0.

| Validación | Resultado |
| --- | --- |
| `corepack yarn lint` | Aprobó API/web. |
| `corepack yarn typecheck` | Aprobó API/web. |
| `corepack yarn test` con `VITEST_MAX_WORKERS=2` | API: 642 tests, 39 suites. Web: 486 tests, 25 archivos. |
| `corepack yarn workspace @cecasem-conecta/api test:integration` | 1.049 tests, 24 suites. |
| Integración específica de archivos | 21 tests aprobados. |
| Validación/config/storage de archivos | 56 unitarios incluidos en el total API. |
| Frontend archivos + cliente API | 29 tests (12 nuevos de archivos y 17 existentes de cliente). |
| `corepack yarn workspace @cecasem-conecta/api prisma:validate` | Schema válido. |
| `prisma:migrate:deploy` / `prisma:migrate:status` | 37 migraciones aplicadas; schema actualizado. |
| `corepack yarn build` | Aprobó API/web. Advertencia Vite de chunk >500 kB. |
| `docker compose --env-file .env.example config --quiet` | Aprobó. |
| Build Docker API/web, startup saludable, Nginx y recreación | Aprobó con volumen privado real. |
| `git diff --check` | Sin errores. |

Negativos: cero bytes, 20 MiB+1, tipo/MIME incompatible, HTML/script, >10 por petición, nombres/traversal/controles/Unicode, clave manipulada, junction/escape, recurso inexistente, sesión revocada/inactividad, cierre/invalidation, DB/auditoría fallida, bytes faltantes/corruptos, FKs/CHECKs, conflicto idempotente, concurrencia, cambio de autorización/estado antes de confirmación, limpieza técnica segura e identidad tardía en frontend.

Los primeros runs detectaron expectativas de auditoría y presupuesto de consultas de las fases anteriores, actualizadas para el nuevo campo/fuente sin retirar comprobaciones. El presupuesto pasa 16→18 SELECT; se mantiene igualdad de consultas con 1.000 registros y paginación acotada. El primer frontend bajo carga paralela de builds/integración tuvo timeouts; con dos trabajadores aprobó completo, sin cambiar timeouts globales. Un intento de integración con usuario DB incorrecto falló de conexión; se repitió con la conexión de pruebas correcta y aprobó. Logs 500 de pruebas negativas son deliberados. pg emite un deprecation warning de consultas concurrentes dentro del adapter existente; sin actualizar dependencias.

Observación de navegador: la carga, listado y layout se verificaron visualmente. La herramienta del navegador interno no entregó el evento de guardado del download blob al pulsar el botón; no se afirma que ese evento manual se haya comprobado. El cliente, entrega/revocación blob y protección de identidad están probados por tests; bytes reales y hashes por Nginx se comprobaron antes/después de recrear contenedores.

La configuración administrativa RF-72 queda como pendiente funcional documentado permitido por el alcance. No hay regresiones funcionales conocidas tras las validaciones finales. El núcleo de 4.1 puede cerrarse con estas observaciones; 4.2 no fue implementada.

## Manifest de archivos de 4.1

### Backend

- `apps/api/prisma/schema.prisma`
- `apps/api/src/app.module.ts`
- `apps/api/src/config/environment.spec.ts`
- `apps/api/src/config/environment.ts`
- `apps/api/src/modules/audit/audit.service.ts`
- `apps/api/src/modules/auth/authorization/authorization.spec.ts`
- `apps/api/src/modules/auth/authorization/permission.ts`
- `apps/api/src/modules/auth/authorization/role-permissions.ts`
- `apps/api/src/modules/communications/communications.service.ts`
- `apps/api/src/modules/relationships/relationship-processes.service.ts`
- `apps/api/src/modules/relationships/relationship-timeline.module.ts`
- `apps/api/src/modules/relationships/relationship-timeline.service.ts`
- `apps/api/src/modules/relationships/timeline.dto.ts`
- `apps/api/src/modules/relationships/timeline.rules.ts`
- `apps/api/test/communication-amendments.integration-spec.ts`
- `apps/api/test/password-reset.integration-spec.ts`
- `apps/api/test/relationship-timeline.integration-spec.ts`
- `apps/api/prisma/migrations/20261004130000_file_audit_action/migration.sql`
- `apps/api/prisma/migrations/20261004130001_private_files/migration.sql`
- `apps/api/prisma/migrations/20261004130002_file_audit_required_operation/migration.sql`
- `apps/api/src/modules/files/file-config.ts`
- `apps/api/src/modules/files/file-error.filter.ts`
- `apps/api/src/modules/files/file-errors.ts`
- `apps/api/src/modules/files/file-storage.ts`
- `apps/api/src/modules/files/file-upload.interceptor.ts`
- `apps/api/src/modules/files/file-validation.spec.ts`
- `apps/api/src/modules/files/file-validation.ts`
- `apps/api/src/modules/files/files.controller.ts`
- `apps/api/src/modules/files/files.dto.ts`
- `apps/api/src/modules/files/files.module.ts`
- `apps/api/src/modules/files/files.service.ts`
- `apps/api/src/modules/files/local-file-storage.spec.ts`
- `apps/api/src/modules/files/local-file-storage.ts`
- `apps/api/test/file-fixtures.ts`
- `apps/api/test/files.integration-spec.ts`

### Frontend

- `apps/web/src/app/layout/authenticated-layout.tsx`
- `apps/web/src/features/communications/communication-detail-page.tsx`
- `apps/web/src/features/relationships/relationship-process-detail-page.tsx`
- `apps/web/src/features/relationships/relationship-timeline.tsx`
- `apps/web/src/features/relationships/timeline-contracts.ts`
- `apps/web/src/lib/api/client.ts`
- `apps/web/src/features/files/attachments.test.tsx`
- `apps/web/src/features/files/attachments.tsx`
- `apps/web/src/features/files/contracts.ts`
- `apps/web/src/features/files/queries.ts`

### Infraestructura

- `.dockerignore`
- `.env.example`
- `.gitignore`
- `apps/api/.env.example`
- `apps/api/.gitignore`
- `apps/api/Dockerfile`
- `docker-compose.yml`
- `infra/nginx/default.conf.template`
- `storage/.gitkeep`

### Documentacion

- `docs/subfase-4.1-archivos.md`
