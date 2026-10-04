# Subfase 3.9 — Restricciones explícitas de no contacto

## Alcance y baseline

Implementada antes de 3.4, sobre `main`, HEAD `b912383a0874e4519f3a27aade9a712da32f319c`.
La línea de partida contenía 47 archivos pendientes de las subfases 3.2/3.3.
Esos cambios se conservaron; no se realizó commit ni push.

Una restricción nace únicamente de una decisión explícita. Rechazo, ausencia de respuesta,
inactividad y condición de un medio de contacto no generan restricciones automáticamente.
No se implementaron comunicaciones, notas ni antecedentes de 3.4.

## Modelo y permisos

`ContactRestriction` refiere exactamente a una organización o una persona independiente,
con claves foráneas reales. Conserva motivo, registrador, fechas, versión y estado ACTIVE/LIFTED.
Levantar exige motivo, autor y fecha; conserva la inscripción original. No existe edición
ni eliminación ordinaria. Una nueva solicitud posterior crea otro registro.

Todos los roles actuales leen y registran. Solo Administrador y Directorio levantan.
El backend comprueba el rol y estado actual del usuario dentro de la operación.
Las capabilities son `relationships.restriction.read`, `.create` y `.lift`.
La restricción bloquea también al Administrador: no hay bypass por rol.

No se propaga a matrices, sedes, personas vinculadas ni antiguos vínculos personales.
Una ficha inactiva o consolidada no admite altas nuevas; su restricción histórica sigue
consultable y puede levantarse con autorización aunque la ficha haya dejado de ser utilizable.

## Integración y concurrencia

El módulo relationships exporta `ContactRestrictionsService`:

- `getActiveRestriction(target, tx?)` consulta el bloqueo del actor exacto.
- `assertContactAllowed(target, tx)` exige la transacción del productor.

Intenciones y procesos llaman a la segunda interfaz después de validar el objetivo y antes
de escribir. La conversión reutiliza la creación transaccional del proceso. No se cambian
estados ni historia de procesos o intenciones preexistentes por registrar una restricción.

Registro, levantamiento y las tres operaciones protegidas comparten un advisory lock de
PostgreSQL por tipo/UUID del actor, con UUID normalizado. Permanece hasta commit/rollback.
El orden de adquisición es usuario, validación/bloqueos del Directorio cuando corresponden,
y bloqueo de restricción. Levantar además bloquea su fila y comprueba `expectedVersion`.
La consulta autoritativa ocurre después del lock, en la misma transacción que la escritura.

Si el registro de la restricción adquiere primero el lock y se confirma, la actuación
posterior falla completa con HTTP 409 `CONTACT_RESTRICTED`. Si la actuación adquiere primero
el lock, se confirma antes de registrar la restricción y permanece como historia válida.
Un levantamiento solo habilita actuaciones después de confirmarse. Los índices únicos
parciales garantizan una ACTIVE por actor; una colisión de hash solo serializa actores
adicionales, sin propagar la restricción.

Auditoría, versión, restricciones, participantes y conversión se confirman o revierten
en su transacción respectiva. Un fallo de auditoría no deja efectos parciales.

## API e interfaz

Base: `/api/v1/contact-restrictions`.

- GET listado paginado, filtros `state`, `organizationId`, `personId`.
- POST registro: motivo y exactamente un objetivo.
- GET `:id`: detalle histórico.
- POST `:id/lift`: motivo y `expectedVersion`.

Las fechas, autores, estado y versión los controla el servidor. DTOs rechazan campos ajenos.
Los errores distinguen 403 de autorización, 400 de validación, 404 y conflictos 409.

Frontend: listado, detalle, altas y levantamiento con confirmación; selección del Directorio,
historia por objetivo, paginación, carga/error/vacío y permisos. El aviso reutilizable
**RESTRICCIÓN ACTIVA — NO CONTACTAR** aparece en los dos formularios de creación y en
el detalle de intención antes de convertir. Un 409 tardío conserva el borrador.
Las queries se invalidan después de mutar y se limpian al cambiar identidad/permisos.

## Auditoría y migraciones

Acciones persistidas: CONTACT_RESTRICTION_CREATED y CONTACT_RESTRICTION_LIFTED.
Cada evento tiene actor, operación y FK a la restricción. Constraints e índice parcial
impiden referencias ajenas y eventos duplicados por acción/restricción.

Se agregaron dos migraciones:

1. `20261004003000_restriction_audit_actions`: catálogo de auditoría.
2. `20261004003001_contact_restrictions`: modelo, relaciones, índices, XOR del objetivo,
   motivo no vacío, fechas/estado/versiones coherentes y ampliación de checks de auditoría.

Las 23 migraciones anteriores permanecen intactas. La separación permite confirmar el
catálogo del enum antes de usar sus valores en los nuevos checks de PostgreSQL.

## Continuidad

3.4 puede incorporar la restricción activa a la consulta de antecedentes institucionales,
reutilizando la interfaz pública y conservando las lecturas históricas. Esta subfase no
implementa esos antecedentes ni inicia la siguiente fase.

## Validaciones ejecutadas

- `corepack yarn lint`: correcto.
- `corepack yarn typecheck`: correcto.
- `corepack yarn test`: 31 suites API / 497 pruebas; 19 archivos frontend / 367 pruebas.
- `corepack yarn build`: correcto en ambos workspaces.
- Integración PostgreSQL completa: 18 suites / 852 pruebas aprobadas.
- Total de las tres suites: 1716 pruebas, 98 más que el baseline (22 unitarias,
  48 de integración y 28 de frontend nuevas).
- Prisma validate: schema válido.
- Migrate deploy/status: 25 migraciones al día en desarrollo y pruebas aisladas.
- Prisma migrate diff de desarrollo contra schema: sin diferencias.
- Revisión manual de SQL, schema, cambios incrementales y archivos nuevos realizada.
- Las 23 migraciones existentes no se modificaron; sin dependencias adicionales.
- Revisión de secretos/archivos de runtime y `git diff --check`: sin incidencias.

No se detectaron regresiones. Observaciones no bloqueantes: bundle principal Vite de
586,45 kB minificado (165,01 kB gzip), aviso de VM Modules de Jest y aviso de consultas
concurrentes de pg presentes en las validaciones. Las pruebas de fallos deliberados
generan logs de respuestas 500 esperadas. No se ejecutó una comprobación visual manual
en navegador ni un nuevo Docker build; los flujos se validaron con HTTP/PostgreSQL y
Testing Library y no se modificó infraestructura.

## Archivos de esta subfase

- `apps/api/prisma/schema.prisma`
- `apps/api/src/modules/audit/audit.service.ts`
- `apps/api/src/modules/auth/authorization/authorization.spec.ts`
- `apps/api/src/modules/auth/authorization/permission.ts`
- `apps/api/src/modules/auth/authorization/role-permissions.ts`
- `apps/api/src/modules/relationships/contact-intents.controller.ts`
- `apps/api/src/modules/relationships/contact-intents.service.ts`
- `apps/api/src/modules/relationships/relationships.module.ts`
- `apps/api/test/password-reset.integration-spec.ts`
- `apps/web/src/app/layout/authenticated-layout.tsx`
- `apps/web/src/app/router/app-routes.tsx`
- `apps/web/src/app/router/navigation.ts`
- `apps/web/src/features/relationships/contact-intent-create-page.tsx`
- `apps/web/src/features/relationships/contact-intent-detail-page.tsx`
- `apps/web/src/lib/api/client.ts`
- `apps/api/prisma/migrations/20261004003000_restriction_audit_actions/migration.sql`
- `apps/api/prisma/migrations/20261004003001_contact_restrictions/migration.sql`
- `apps/api/src/modules/relationships/contact-restriction-error.filter.ts`
- `apps/api/src/modules/relationships/contact-restriction.dto.ts`
- `apps/api/src/modules/relationships/contact-restriction.rules.spec.ts`
- `apps/api/src/modules/relationships/contact-restriction.rules.ts`
- `apps/api/src/modules/relationships/contact-restrictions.controller.ts`
- `apps/api/src/modules/relationships/contact-restrictions.service.spec.ts`
- `apps/api/src/modules/relationships/contact-restrictions.service.ts`
- `apps/api/src/modules/relationships/relationship-processes.authorization.spec.ts`
- `apps/api/src/modules/relationships/relationship-processes.controller.ts`
- `apps/api/src/modules/relationships/relationship-processes.service.ts`
- `apps/api/test/contact-restrictions.integration-spec.ts`
- `apps/web/src/features/relationships/contact-restriction-create-page.tsx`
- `apps/web/src/features/relationships/contact-restriction-detail-page.tsx`
- `apps/web/src/features/relationships/contact-restriction-notice.tsx`
- `apps/web/src/features/relationships/contact-restrictions-page.tsx`
- `apps/web/src/features/relationships/contact-restrictions.test.tsx`
- `apps/web/src/features/relationships/relationship-process-create-page.tsx`
- `apps/web/src/features/relationships/restriction-contracts.ts`
- `apps/web/src/features/relationships/restriction-queries.ts`
- `docs/subfase-3.9-restricciones.md`
