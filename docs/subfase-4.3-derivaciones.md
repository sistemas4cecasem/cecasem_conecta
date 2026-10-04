# Subfase 4.3 — Derivaciones y contactos recomendados

## Baseline y alcance

Rama `main`, HEAD `926d1c58f9f88cce9b44dc88e10eed8a2d091934`, árbol inicial limpio. Las subfases 4.1, 4.2 y la entrega P0 de 4.5 estaban incorporadas. Esta entrega registra y consulta recomendaciones históricas desde comunicaciones reales. Sin commit ni push.

## Modelo histórico

`Referral` conserva UUID, comunicación de origen obligatoria, autor, fecha, nombre recomendado, función, organización mencionada, tipo y valor del medio y observaciones. Utiliza los tipos canónicos `EMAIL`, `PHONE`, `LINKEDIN`, `FORM`, `WEB`, `OTHER`.

Person, Organization y ContactMethod son referencias opcionales con FKs restrictivas. La recomendación textual se conserva separadamente de las fichas actuales: no se completa automáticamente con datos de una ficha, no se fabrican datos faltantes y no se crea ningún registro maestro durante la derivación. La selección expresa de un medio existente copia su valor al dato histórico y establece la referencia. La creación de fichas sigue utilizando los flujos normales del Directorio.

Debe existir persona identificada, nombre mencionado, organización identificada/mencionada o un medio. Observaciones y cargo solos no bastan. Se recortan los extremos, se conserva capitalización y contenido interno, se rechazan blancos, NUL y longitudes excesivas. El tipo y valor del medio deben estar presentes juntos; la validación reutiliza las reglas canónicas del Directorio, conservando el valor histórico sin normalizar su capitalización.

No existe PATCH, DELETE ni vinculación posterior silenciosa. Un trigger impide actualizar el hecho consolidado. El sistema no agrega un mecanismo nuevo de correcciones ni modifica recomendaciones antiguas al editar o consolidar fichas.

## Directorio y concurrencia

Directory expone `DirectoryReferralsService`, una interfaz pública específica de referencias históricas. Admite personas con vínculos institucionales y fichas inactivas, sin utilizar reglas de objetivos de contacto. Nuevas referencias a registros consolidados se rechazan para que el usuario seleccione la ficha principal. Las referencias ya registradas sobreviven a la consolidación; la proyección conserva el ID histórico y ofrece el ID principal para navegación.

Un medio vinculado debe existir, ser utilizable al confirmar y coincidir en tipo/valor. Si hay persona seleccionada, la asociación activa debe corresponder a ella; en su ausencia se valida la organización seleccionada. Una persona y su organización pueden vincularse sin exigir que el correo personal también sea un medio institucional. Un medio textual puede conservarse sin ninguna FK. Un cambio posterior de condición o valor no modifica el snapshot.

Orden de coordinación: credenciales del actor → comunicación → lock compartido de Directory → organización/persona → medio → asociación. Se revalidan las referencias dentro de la transacción. Consolidaciones requieren el lock exclusivo existente; invalidaciones de comunicaciones y cambios de medios utilizan los mismos registros bloqueados. No se modifican ProcessParticipant, estado, versión ni lastActivityAt.

## Idempotencia, autorización y auditoría

Los cuatro roles activos pueden consultar y registrar. Se exigen capabilities `referrals.read` / `referrals.create`, lectura de comunicaciones y lectura de procesos. No hay propiedad exclusiva por creador; se preserva la continuidad entre usuarios. Los guards verifican sesión y el servicio revalida usuario activo y autorización.

La creación utiliza `Idempotency-Key` UUID. La unicidad `(createdByUserId, requestKey)` y el fingerprint del origen/payload normalizado recuperan el resultado del mismo comando y rechazan con 409 cambios de contenido u origen. Repeticiones legítimas con otras keys o comunicaciones no quedan bloqueadas. El reintento de un hecho existente se recupera aunque posteriormente se invalide su origen; una nueva derivación desde una comunicación invalidada devuelve 409.

`REFERRAL_CREATED` referencia Referral mediante FK única. Autor y operationId deben coincidir con el hecho. Derivación y auditoría se confirman en la misma transacción y se revierten juntos ante un fallo. No se auditan consultas ni se copian cuerpos de comunicaciones en la auditoría.

## API y proyecciones

- `POST /api/v1/communications/:id/referrals`
- `GET /api/v1/communications/:id/referrals`
- `GET /api/v1/referrals/:id`

DTOs y Swagger documentan los contratos. Las respuestas tienen `Cache-Control: no-store`, errores seguros en español y validación de UUID. El listado usa páginas de hasta 100 filas, orden ascendente fecha/UUID y consultas por lotes a Directory, sin N+1.

El timeline incorpora `REFERRAL_CREATED` como sexta fuente de la proyección existente. La fecha corresponde al registro de la derivación, no al envío/recepción original. El cursor mantiene fecha, registro, fuente e ID; no cambia el significado de cursores anteriores. Una fuente vacía realiza únicamente un SELECT. Las pruebas de consulta acotada de las cinco fuentes previas se adaptan de 18 a 19 SELECT para reflejar exactamente esa nueva consulta; siguen exigiendo igualdad de consultas con 1000 registros. Las derivaciones con fichas vinculadas también se consultan por lotes.

## Frontend

La sección “Contactos recomendados” aparece en el detalle de comunicación. Presenta autor, fecha, snapshots, origen, enlaces, páginas y estados de carga/error/vacío. La acción “Registrar contacto recomendado” está disponible solo desde una comunicación válida.

React Hook Form y Zod validan un formulario que separa datos mencionados y fichas existentes opcionales. `DirectoryTargetPicker` incorpora un modo histórico por tipo, reutilizando la búsqueda incremental y paginada existente. Su comportamiento como selector de objetivos no cambia. Los medios de la ficha seleccionada se consultan mediante el flujo paginado existente de contactos.

El mismo payload reintentado conserva la key; cambios de payload inician un intento diferente. Errores conservan el borrador. TanStack Query invalida comunicación y timeline después de crear. Las claves incluyen permisos de derivaciones y la respuesta de lectura comprueba la identidad vigente antes de incorporarse a la caché.

El timeline muestra “CONTACTO RECOMENDADO”, con origen y enlaces, distinguido de RECEIVED, SENT, notas y archivos. No se generan notificaciones por derivaciones.

## Migraciones

- `20261005020000_referral_action`: amplía AuditAction.
- `20261005020001_referrals`: tabla, índices, FKs, deduplicación, CHECKs de información mínima/texto/medio/fingerprint, trigger de inmutabilidad y coherencia de auditoría.

Las 41 migraciones históricas permanecen intactas. Las 43 migraciones se aplicaron desde cero sobre PostgreSQL QA con la cuenta de aplicación `rolsuper=false`; migrate status está actualizado y migrate diff no detecta divergencias.

## Evidencia funcional

En el proyecto Docker aislado `cecasem_referrals43_audit`, Búsqueda abrió una respuesta RECEIVED y registró “María”, “Fundación X” y `Maria@Example.org`, vinculando una organización existente y sin crear Person. HTTP verificó 201, retry con el mismo ID, 409 por payload distinto, 401 anónimo y lectura por los cuatro roles. Se verificaron también una recomendación incompleta y una persona existente con vínculo.

El navegador comprobó formulario, selección de organización, listado y timeline. La vista móvil 390×844 no presentó desbordamiento horizontal; consola sin errores. Las capturas se guardan fuera del repositorio, en las visualizaciones del chat.

## Validaciones

| Validación ejecutada mediante Corepack/Yarn 4 | Resultado |
| --- | --- |
| `yarn lint` | Aprobada, sin errores ni advertencias ESLint |
| `yarn typecheck` | Aprobada en ambos workspaces |
| `VITEST_MAX_WORKERS=1 yarn test` | API: 740 pruebas / 43 suites; web: 522 pruebas / 28 archivos, todas aprobadas |
| `yarn workspace @cecasem-conecta/api test:integration` | 1103 pruebas / 27 suites PostgreSQL y HTTP, todas aprobadas |
| Pruebas nuevas específicas 4.3 | 29 unitarias API + 22 integración + 12 frontend = 63, incluidas en las suites anteriores |
| `yarn workspace @cecasem-conecta/api prisma:validate` | Schema válido |
| `prisma:migrate:deploy` / `prisma:migrate:status` | 43 migraciones aplicadas; sin pendientes |
| `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | Sin diferencias |
| `yarn build` | API y web aprobadas |
| Docker Compose config / build / startup | Aprobados; API, web y PostgreSQL saludables |
| HTTP y navegador | Creación, retry, conflicto, lectura entre roles, referencias existentes/incompletas, timeline y móvil aprobados |
| `git diff --check` y revisión de secretos | Aprobados; 41 migraciones históricas intactas |

La comprobación final después de recrear los contenedores encontró tres derivaciones persistidas y una única persona, sin participación del registrador. La invalidación del origen por el administrador devolvió 201; una nueva recomendación devolvió 409, mientras las tres anteriores, sus snapshots, el cuerpo original y lastActivityAt permanecieron intactos.

Se usó el límite de workers autorizado por el prompt, sin modificar timeouts globales. Permanecen avisos no bloqueantes del tooling: VM Modules experimental de Jest, uso concurrente de cliente pg en pruebas existentes y bundle Vite de 686,70 kB. Los errores técnicos emitidos por escenarios de fallos deliberados no representan fallos de las suites.

El CLI de Prisma se ejecutó desde el workspace local mediante Corepack/Yarn 4, conectado a PostgreSQL QA; la imagen de producción no incorpora el workspace de herramientas. Se desactivaron las cuatro identidades sintéticas, se eliminaron sus hashes de contraseña y se revocaron todas sus sesiones. Se detuvo exclusivamente el proyecto QA, conservando sus volúmenes e historial. Los contenedores preexistentes y Codex permanecieron abiertos. Se retiraron los archivos temporales de preparación y credenciales de `.git`.

## Inventario final

38 archivos: 22 modificados y 16 nuevos, sin staging. HEAD permanece en `926d1c58f9f88cce9b44dc88e10eed8a2d091934`. No se realizó commit ni push.

### API y pruebas — 25 archivos

- `apps/api/prisma/schema.prisma`
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/audit/audit.service.ts`
- `apps/api/src/modules/auth/authorization/authorization.spec.ts`
- `apps/api/src/modules/auth/authorization/permission.ts`
- `apps/api/src/modules/auth/authorization/role-permissions.ts`
- `apps/api/src/modules/communications/communications.service.ts`
- `apps/api/src/modules/directory/directory.module.ts`
- `apps/api/src/modules/directory/directory-referrals.service.ts`
- `apps/api/src/modules/relationships/relationship-timeline.module.ts`
- `apps/api/src/modules/relationships/relationship-timeline.service.ts`
- `apps/api/src/modules/relationships/timeline.dto.ts`
- `apps/api/src/modules/relationships/timeline.rules.ts`
- `apps/api/src/modules/referrals/referral-error.filter.ts`
- `apps/api/src/modules/referrals/referral.dto.ts`
- `apps/api/src/modules/referrals/referral.rules.ts`
- `apps/api/src/modules/referrals/referral.rules.spec.ts`
- `apps/api/src/modules/referrals/referrals.controller.ts`
- `apps/api/src/modules/referrals/referrals.module.ts`
- `apps/api/src/modules/referrals/referrals.service.ts`
- `apps/api/test/referrals.integration-spec.ts`
- `apps/api/test/communication-amendments.integration-spec.ts`
- `apps/api/test/files.integration-spec.ts`
- `apps/api/test/password-reset.integration-spec.ts`
- `apps/api/test/relationship-timeline.integration-spec.ts`

### Frontend — 10 archivos

- `apps/web/src/features/communications/communication-detail-page.tsx`
- `apps/web/src/features/communications/queries.ts`
- `apps/web/src/features/directory/target-picker.tsx`
- `apps/web/src/features/referrals/contracts.ts`
- `apps/web/src/features/referrals/queries.ts`
- `apps/web/src/features/referrals/referrals-panel.tsx`
- `apps/web/src/features/referrals/referrals.test.tsx`
- `apps/web/src/features/relationships/relationship-timeline.tsx`
- `apps/web/src/features/relationships/timeline-contracts.ts`
- `apps/web/src/lib/api/client.ts`

### Migraciones — 2 archivos

- `apps/api/prisma/migrations/20261005020000_referral_action/migration.sql`
- `apps/api/prisma/migrations/20261005020001_referrals/migration.sql`

### Documentación — 1 archivo

- `docs/subfase-4.3-derivaciones.md`

## Cierre

SUBFASE 4.3 COMPLETADA CON OBSERVACIONES por los avisos de tooling descritos. Sin pendientes funcionales de 4.3. El repositorio queda preparado para abordar 4.4 Reuniones mediante una solicitud nueva; esa subfase no se implementó.
