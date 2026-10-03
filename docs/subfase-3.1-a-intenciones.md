# SUBFASE 3.1-A — Intenciones de contacto

Esta entrega implementa crear, listar, consultar y cancelar intenciones. No cierra
3.1: conversión a proceso pendiente de 3.2 y de la base de participante creador de
3.3. No hay endpoint convert/close, procesos, comunicaciones ni recordatorios.

## Modelo y reglas

`ContactIntent` conserva UUID, propósito de 1–5000 caracteres, autor, exactamente
una FK de objetivo (organización o persona), estado, versión, creación,
actualización, última actividad y datos de cancelación. FK RESTRICT: no se pierde
historia al desactivar cuentas/fichas. La antigüedad no cambia estado ni visibilidad.

Estados del enum: ACTIVE, CONVERTED, CANCELLED, CLOSED. Solo se crean ACTIVE y se
permite ACTIVE → CANCELLED. Los otros valores quedan reservados sin operaciones
públicas. `lastActivityAt` es igual a creación inicialmente y a cancelación después;
consultar no actualiza actividad. No es un campo de texto ni un scheduler.

El objetivo nuevo debe ser activo y no consolidado. Persona independiente se
interpreta mediante el Directorio existente: sin vínculo persona-organización
vigente (`isCurrent`). Una persona vinculada usa su organización como referencia.
`DirectoryTargetService` es la interfaz pública mínima de lectura/validación;
relationships no consulta tablas internas del Directorio. Las fichas históricas
siguen consultables después de inactivación o consolidación; no se redirigen FK.

## Autorización

| Acción | Administración | Directorio | Búsqueda | Planificación |
| --- | --- | --- | --- | --- |
| Crear y consultar | Sí | Sí | Sí | Sí |
| Cancelar propia | Sí | Sí | Sí | Sí |
| Cancelar ajena | Sí | Sí | No | No |

Capacidades: `relationships.intent.read`, `.create`, `.cancel`. La propiedad se
verifica en servicio, no en el guard RBAC ni solo en frontend. El autor se obtiene
de sesión. Las escrituras revalidan usuario activo/rol vigente con el lock público
de UsersService; no aceptan el autor ni estado desde el cliente.

## API

- GET /api/v1/contact-intents — read; paginación y filtros state, authorUserId,
  organizationId y personId. pageSize máximo 100, default 25; state default all.
- POST /api/v1/contact-intents — create; purpose y exactamente un objetivo.
- GET /api/v1/contact-intents/:id — read.
- POST /api/v1/contact-intents/:id/cancel — cancel; expectedVersion obligatorio.

POST responde 201 conforme al comportamiento Nest existente. Listado ordenado por
createdAt e ID descendentes; conteo y proyecciones en transacción RepeatableRead.
Lecturas no-store. DTO público incluye objetivo, identidad acotada de autor y
cancelador, fechas y `canCancel`; no emails personales, tokens o hashes.

Errores uniformes: 400 validación, 401 sesión, 403 permiso/propiedad, 404 intención
ausente, 409 objetivo no utilizable, intención no activa o versión obsoleta.

## Transacciones y auditoría

Crear confirma intención y CONTACT_INTENT_CREATED conjuntamente. Cancelar bloquea
fila, valida versión/estado/propiedad, actualiza condicionalmente y registra
CONTACT_INTENT_CANCELLED en la misma transacción. Segunda cancelación se rechaza;
no es un no-op que reescriba usuario/fecha. Fallo de auditoría revierte la operación.

AuditEvent tiene FK contactIntentId, actor y operationId; su CHECK mantiene las
familias anteriores y añade la nueva sin mezclar referencias. Un índice parcial
único impide repetir cada acción de esta entrega sobre la misma intención.
DirectoryChange no se usa para intenciones.

## Migraciones

- 20261003182121_contact_intent_audit_actions: amplía AuditAction.
- 20261003182122_contact_intents: generado con migrate dev --create-only y
  revisado antes de aplicar; incorpora modelo, FK, índices y CHECK de objetivo,
  propósito, versión, actividad y cancelación; amplía el CHECK de auditoría.

La separación permite usar nuevos valores del enum PostgreSQL después de la
migración que los incorpora. No se modificaron migraciones anteriores.

## Frontend

Rutas `/contact-intents`, `/contact-intents/new`, `/contact-intents/:id`, integradas
en layout y navegación. Selector contextual reutiliza GET search, su contrato,
debounce, cancelación y paginación; no admite IDs escritos a mano. Propósito usa
React Hook Form/Zod. Cancelación requiere confirmación y permiso contextual backend.

Queries ligadas a usuario, rol y capacidades de intenciones. Cambio de identidad,
rol/permisos o logout retira caché incompatible. Mutaciones actualizan el detalle
con respuesta del servidor e invalidan queries; 403/409 conservan contexto y no
reintentan automáticamente. Conflicto requiere recargar/revisar.

## Validación

Ejecutar con Corepack/Yarn 4.18.1: lint, typecheck, test y build desde raíz.
Schema: `corepack yarn workspace @cecasem-conecta/api prisma:validate`.
Integración: entorno aislado descrito en infra/development/README.md, base `_test`,
migrate deploy y `test:integration`. La suite de intenciones incluye PostgreSQL,
HTTP, permisos, propiedad, conservación, constraints, concurrencia y rollback.
Frontend prueba formularios, selección, estados, confirmación, conflictos y caché.

No aplicar migrate dev ni las pruebas de escritura contra la base institucional.

## Resultado verificado — 3 de octubre de 2026

SUBFASE 3.1-A COMPLETADA CON OBSERVACIONES. SUBFASE 3.1 COMPLETADA: NO.
Conversión intención → proceso pendiente de 3.2/3.3.

Baseline: main, HEAD 6f4e96cb62dcef5e88518d33b1e2efa60976317a, working tree limpio.
Node v24.14.0; Yarn global 1.22.22; Corepack Yarn 4.18.1, usado en esta entrega.

- Lint, typecheck, test y build raíz: aprobados con corepack yarn.
- API: 26 suites, 399 pruebas; frontend: 17 archivos, 289 pruebas.
- PostgreSQL/HTTP: 15 suites, 699 pruebas; intenciones aporta 52.
- Nuevas pruebas: 20 reglas unitarias, 52 integración, 28 frontend.
- Schema válido; 19 migraciones aplicadas y al día en base aislada _test.
- Migración creada con create-only y validada/aplicada en desarrollo con shadow.
- git diff --check: aprobado; también se revisaron archivos nuevos.

La primera regresión integral falló en dos pruebas existentes: un filtro CONTACT_
incluía las nuevas acciones de intenciones, y una lista exacta de columnas de audit
no contemplaba contactIntentId. Se ajustaron a sus familias/columnas explícitas;
la segunda ejecución integral aprobó los 699 casos. No se relajaron constraints.

Observaciones no bloqueantes: VM Modules experimental, aviso de concurrencia del
driver pg en suites existentes y chunk principal Vite de 555.76 kB (>500 kB).
No se ocultaron ni se cambiaron umbrales para silenciar estos avisos.

No hay regresiones conocidas tras las suites finales. La UI se probó con Testing
Library; no se afirma un recorrido manual en navegador. No se desplegó ni se
migró el runtime institucional. Sin nuevas dependencias, cambios de lockfile,
commit o push.
