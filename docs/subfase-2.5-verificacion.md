# SUBFASE 2.5 — RESULTADO FINAL

## Estado

**SUBFASE 2.5 COMPLETADA.** Verificación contextual, revisión derivada y configuración administrativa integradas en modelo, API, permisos, interfaz y PostgreSQL.

## Baseline

- Rama: `main`.
- HEAD: `f4f583e3bb5304b10da1478097b19ad754f81b0e`.
- Commit previo autorizado: `feat(directorio): completar el historial de fichas`, con resumen y validaciones en español. Sin push.
- Working tree limpio después de ese commit, antes de iniciar 2.5.
- 13 migraciones y 978 pruebas: API 304, frontend 166, PostgreSQL/HTTP 508.
- Revisados AGENTS raíz/API/web, documentación 2.1–2.4, directory, historial, audit, sesiones y RBAC.

## Implementado

Una entidad histórica `Verification` para los cinco objetivos existentes, acciones explícitas de corroboración, condición derivada y consulta paginada. Un módulo `Settings` acotado a dos intervalos, con versión y auditoría tipada. Paneles en fichas de organizaciones, personas, vínculos y asociaciones de contacto, más formulario administrativo.

Para los prefijos `/api/v1/organizations`, `/api/v1/people`, `/api/v1/person-organization-relations`, `/api/v1/person-contacts` y `/api/v1/organization-contacts`, se exponen `GET /:id/verification`, `POST /:id/verify` y `GET /:id/verifications?page=1&pageSize=25` (máximo 100). El POST recibe expectedVersion; únicamente las asociaciones requieren además expectedContactValueVersion, obtenida en la condición. Fuente y URL son opcionales. UUID/DTO se validan y las lecturas usan Cache-Control no-store. La condición pública incluye classification, intervalMonths, verificationStatus, lastVerifiedAt, lastVerifiedBy, nextReviewAt, changedSinceVerification y timeReviewDue, además de versiones para proteger la confirmación.

## Decisiones efectivamente tomadas

| Objetivo | Clase | Intervalo inicial |
| --- | --- | --- |
| Organization | Institucional | 12 meses |
| OrganizationContact | Institucional | 12 meses |
| Person | Personal | 6 meses |
| PersonOrganizationRelation | Personal | 6 meses |
| PersonContact | Personal | 6 meses |

No se verifica Category ni ContactMethod globalmente. Las verificaciones son eventos nuevos, sin resultados adicionales ni adjuntos. La consulta de condición requiere `directory.read`; el historial, `directory.history.read`; corroborar, `directory.verify`. Los cuatro roles poseen las tres capacidades.

Los objetos inactivos, vínculos finalizados y asociaciones con canal UNUSABLE pueden corroborarse: se verifica su información/contexto, sin reactivarlos ni declarar utilizable el canal. La interfaz muestra ambos conceptos por separado.

## Modelo

`Verification` conserva UUID, una de cinco FK de objetivo, FK de autor, fecha de servidor TIMESTAMPTZ(3), versión del objeto y, para asociaciones, versión del valor del canal; fuente textual opcional de hasta 1000 caracteres y URL HTTP(S) opcional de hasta 2048. El contrato público del historial contiene objetivo, UUID del evento, fecha, autor público y fuente; excluye campos privados y versiones internas.

Constraints: exactamente un objetivo; objectVersion >= 1; contactValueVersion >= 1 obligatorio únicamente para asociaciones. Las seis FK son RESTRICT para eliminación/actualización, con índices por objetivo/fecha/UUID y autor. No existen rutas para editar o eliminar verificaciones históricas.

El historial es autoritativo. `lastVerifiedAt` es una proyección materializada en los cinco objetivos, actualizada dentro de la transacción que inserta el evento. La actualización SQL modifica únicamente ese campo; conserva updatedAt, versión y estados. El vínculo recibe ahora esa columna nullable. `lastVerifiedBy` se deriva del último evento, conservando autores actualmente desactivados.

`VerificationSettings` es una fila explícita id=1, con intervalos personal/institucional, versión positiva y updatedAt. CHECK restringe ambos intervalos a enteros de 1 a 120 meses. La migración inserta los defaults 6/12 en bases limpias y upgrades. No hay configuración key/value ni seeds manuales.

## RBAC

| Capacidad | Administrador | Directorio | Búsqueda | Planificación |
| --- | --- | --- | --- | --- |
| directory.verify | Sí | Sí | Sí | Sí |
| settings.verification.update | Sí | No | No | No |
| Leer intervalos con directory.read | Sí | Sí | Sí | Sí |

Sesiones y permisos se comprueban en backend; los servicios de mutación también revalidan actor activo y capability. Ocultar controles no sustituye esas comprobaciones.

## Migraciones

1. `20261002231000_verification_settings_action`: amplía AuditAction y confirma el enum antes de utilizarlo.
2. `20261002231100_directory_verifications`: modelos, proyecciones, valueVersion, FK, índices, CHECK y defaults; cuatro columnas tipadas de auditoría para valores anteriores/nuevos de cada intervalo. La condición anterior de AuditEvent se conserva, exigiendo NULL en los campos nuevos para las acciones existentes.

Las 13 migraciones anteriores no se editaron. Validación limpia 0→15 y upgrade 13→15 aprobados; 16 tablas preservadas campo por campo, incluidos sesiones, historial y snapshots históricos. Los defaults quedan disponibles sin intervención administrativa y no se inventan verificaciones previas.

El validador `infra/development/validate-directory-migrations.cjs` requiere DATABASE_URL loopback terminada en `_test`, crea únicamente bases QA con nombres aleatorios y elimina solo esas bases/staging. Nunca resetea runtime. Para reproducir 2.5 después de incorporar migraciones posteriores, utilizar `--phase=2.5`. Selectores históricos aprobados:

| Selector | Upgrade | Tablas preservadas |
| --- | --- | --- |
| --phase=2.1 | 6→8 | 7 |
| --phase=2.2 | 8→10 | 11 |
| --phase=2.3 | 10→12 | 13 |
| --phase=2.4 | 12→13 | 16 |
| Sin selector | 13→15 | 16 |

La documentación 2.4 solo actualiza su comando para utilizar el selector histórico explícito.

## Pruebas

| Suite | Antes | Después | Nuevas |
| --- | --- | --- | --- |
| API, unitarias/E2E sin PostgreSQL | 304 | 322 | 18 |
| Frontend | 166 | 190 | 24 |
| PostgreSQL/HTTP real | 508 | 561 | 53 |
| Total | 978 | **1073** | **95** |

API: 22 suites aprobadas; frontend: 13; PostgreSQL/HTTP: 12. Cubiertos clasificación, calendarios, frontera temporal, versiones, contacto compartido, configuración, defaults, CHECK/FK, rollback, concurrencia, cuatro roles, autores desactivados, objetos inactivos, canal UNUSABLE, privacidad, formularios, confirmación, 403/409, paginación, carga/error/reintento, invalidación y logout.

Los tests anteriores de auditoría conservan las comprobaciones de campos y secretos: agregan los cuatro campos nullable nuevos al contrato esperado. El nuevo caso de configuración no se ejecuta como una acción de administración de usuarios; tiene pruebas específicas en la suite de verificación.

## RF-14

Crear, editar, finalizar o cambiar condición no verifica. Corroborar conserva createdAt y updatedAt; solo añade verifiedAt al historial y actualiza lastVerifiedAt. Caso PostgreSQL específico y recorrido real: creación de persona a las 18:33:58, primera verificación 18:34:08, modificación 18:34:15 y segunda verificación 18:34:24, hora local del 02/10/2026. La verificación no genera DirectoryChange ni AuditEvent duplicado.

## RF-19

POST explícito, checkbox de confirmación y objeto identificado. Se registra autor y hora del servidor; el cliente no puede suministrar autor/fecha. Dos corroboraciones concurrentes del mismo objeto son válidas y se conservan como dos eventos con ambos autores. Se bloquea la fila objetivo, sin bloqueo global; asociaciones bloquean primero el canal en el mismo orden de las mutaciones existentes.

Las versiones esperadas protegen contra corroborar un contenido que cambió desde que se abrió el formulario. Ante 409, la interfaz conserva la propuesta hasta una recarga explícita que refresca fichas/condiciones y exige confirmar de nuevo.

## RF-20

Condición derivada del último evento, versiones actuales, parámetros y reloj del servidor:

- NEVER_VERIFIED: sin evento, autor ni fecha de revisión inventados.
- CURRENT: corroborado, sin cambio relevante y sin vencimiento.
- REVIEW_DUE: cambios posteriores, vencimiento o ambos.

`changedSinceVerification` y `timeReviewDue` explican separadamente las causas. La interfaz muestra textos, autor, fechas y meses efectivos; no decide vigencia con el reloj del navegador.

La suma usa meses calendario UTC, conserva hora/minuto/segundo/milisegundo y limita el día al último válido del mes de destino: 31/01/2024 + 1 = 29/02/2024; 29/02/2024 + 12 = 28/02/2025. `now >= dueAt` significa revisión pendiente. Probados fin de mes, febrero, bisiesto, cambio de año y ±1 ms alrededor de la frontera. No se añadió biblioteca temporal.

## RF-21

Solo Administración modifica los parámetros. PUT protegido, rango 1–120, versión esperada y lock de la fila de configuración. Dos propuestas concurrentes desde la misma versión producen un éxito y un conflicto, sin pérdida silenciosa. Un no-op no cambia versión ni genera auditoría.

Configuración y `VERIFICATION_SETTINGS_CHANGED` se guardan en la misma transacción, con actor, operación y cuatro valores tipados anteriores/nuevos. Un fallo de auditoría revierte el cambio de settings.

## Contactos compartidos

Cada asociación se corrobora independientemente. PostgreSQL y recorrido real utilizan un mismo canal asociado a persona y organización: verificar la personal deja la institucional NEVER_VERIFIED, hasta corroborarla separadamente.

`ContactMethod.valueVersion` aumenta solo al corregir realmente el valor del canal. Añadir otra asociación, cambiar etiqueta o condición global no cambia esa versión del valor. La propia asociación tiene su versión de contenido/contexto/estado. Al corregir el canal, las asociaciones previamente verificadas requieren revisión conservando todos sus eventos; regresar luego al valor anterior no restaura automáticamente la vigencia.

## Modificación posterior

Se compara la versión corroborada con la vigente en el objeto. Organización/persona: edición de ficha y estado. Vínculo: edición y finalización. Asociación: fuente, notas, contexto y estado, además de valueVersion del medio. Lecturas, corroboraciones y no-ops no incrementan esas versiones.

Un cambio posterior conserva la fecha y el evento previos, explica la causa y exige corroborar otra vez. Pruebas PostgreSQL para los cinco objetivos; aceptación real de persona con ambos eventos visibles y recuperación de CURRENT tras la segunda corroboración.

## Configuración

Inicial: personal 6 / institucional 12. GET/PUT `/api/v1/settings/verification`. La edición de intervalos invalida las queries del Directorio que derivan condición, sin actualizar todas las fichas ni los eventos.

Escenario automatizado con reloj controlado: persona corroborada el 31/01, consulta el 30/06, CURRENT con 6 meses; reducir a 4 produce REVIEW_DUE por tiempo; restaurar 6 recupera CURRENT. Los eventos permanecen exactamente iguales.

En runtime se usaron fechas reales: cambiar 6→4 movió la próxima revisión de la persona del 02/04/2027 al 02/02/2027, conservando fecha/autor y ambos eventos. Los seis eventos QA completos se compararon antes/después y permanecieron idénticos. No se modificaron timestamps artificialmente en runtime.

## Validaciones

| Comando/flujo ejecutado | Resultado |
| --- | --- |
| yarn lint | Aprobado en Windows |
| yarn typecheck | Aprobado en Windows |
| yarn test | Aprobado completo en contenedor Linux QA: API y web |
| yarn build | Aprobado en Windows |
| yarn workspace @cecasem-conecta/api prisma:generate | Aprobado en Windows y Linux |
| yarn workspace @cecasem-conecta/api prisma:validate | Aprobado en contenedor de migraciones |
| yarn workspace @cecasem-conecta/api prisma:migrate:status | Aprobado: 15 migraciones, esquema al día |
| yarn workspace @cecasem-conecta/api test:integration | Aprobado en Linux contra PostgreSQL de pruebas |
| Validador limpia/upgrade y cuatro selectores históricos | Aprobados |
| docker compose build | API/web aprobados |
| Build del target de migraciones | Aprobado |
| prisma:migrate:deploy mediante Compose | Dos migraciones nuevas aplicadas |
| docker compose up -d --wait | API/web/db healthy |
| /api/v1/health | HTTP 200 |
| Configuración sin sesión | HTTP 401 |
| PUT settings con Búsqueda | HTTP 403 |
| git diff --check / revisión de diff y secretos | Aprobados |

Limitación local comprobada: la directiva de Control de aplicaciones de Windows bloquea la DLL nativa de Argon2, error 4551. Por ello `yarn test` y la integración API en Windows fallan al cargar el binario. No se deshabilitó ni evadió la directiva. Se ejecutó `yarn test` completo y `test:integration` en el contenedor Linux de desarrollo del proyecto, con el mismo código y lockfile. La suite web de 190 pruebas también pasó en Windows. El contenedor QA se retiró. Esta limitación no bloquea el despliegue Docker Linux validado.

Los errores HTTP 500 emitidos durante pruebas de fallos/rollback son intencionales; esas pruebas pasan. El warning experimental de VM Modules ya pertenece al runner existente.

## Aceptación funcional

Recorrido real en `http://localhost:8080`, mediante navegador integrado y usuarios ficticios temporales:

1. Login como Búsqueda; organización/persona nuevas permanecen NEVER_VERIFIED.
2. Persona corroborada con fuente y URL, autor/fecha/6 meses visibles.
3. Edición de nombres: REVIEW_DUE, fecha anterior intacta y causa visible.
4. Segunda corroboración: CURRENT y dos eventos históricos.
5. Vínculo nuevo independiente, corroborado sin modificar su vigencia/cargo.
6. Organización corroborada con 12 meses.
7. Un correo canónico reutilizado por persona y organización con confirmación explícita.
8. Corroboración personal mantiene institucional NEVER_VERIFIED; luego se corrobora institucional por separado.
9. Login administrativo, edición 6→4, confirmación visible, nueva próxima revisión y eventos intactos.
10. Login como Búsqueda: página administrativa bloqueada; PUT HTTP real devuelve 403.
11. Ficha, historial y formulario comprobados a 390 px útiles; ancho del contenido = ancho visible, sin overflow horizontal.
12. Logout; viewport restaurado y pestaña conservada en login. Fixtures eliminados por UUID acotados, once tablas recuperan sus conteos anteriores, configuración original restaurada y credenciales temporales retiradas del host/contenedor/sesión de revisión. La API/web/db siguen healthy.

Capturas con datos ficticios guardadas fuera del repositorio, en el directorio de visualizaciones de esta conversación: `qa25-persona-historial.png`, `qa25-intervalos.png`, `qa25-verificacion-390.png` y `qa25-verificacion.png`.

## Bundle

JS: **517,96 kB minificado / 151,28 kB gzip**. CSS: 13,03 kB / 3,43 kB gzip. Incremento JS respecto de 2.4: 9,40 kB minificado y 1,46 kB gzip. Warning de chunk >500 kB no bloqueante; no se modificó Vite para ocultarlo ni se realizó optimización general.

## Regresiones

Ninguna observada en las suites existentes ni en el recorrido real. Los mocks anteriores ahora responden al contrato nuevo de condición; no se retiraron sus assertions. La auditoría de restablecimiento comprueba los campos nuevos como NULL.

## Pendientes

Sin pendientes funcionales de 2.5. Permanece la limitación del binario Argon2 en el entorno Windows descrita arriba; las validaciones completas pasan en Docker Linux.

## Fuera de alcance respetado

Sin duplicados, similitud, consolidación, módulo search, dashboard, importación/exportación, notificaciones, scheduler, procesos, comunicaciones, archivos, oportunidades, reuniones o traducción. Sin dependencias nuevas, cambios de lockfile, arquitectura futura o actualización de Notion. La implementación de 2.5 se cerró sin commit ni push; posteriormente el usuario autorizó expresamente su commit como requisito previo de 2.6.

## Estado Git

Cambios de 2.5 sobre el commit previo de 2.4, revisados antes de crear el commit autorizado `feat(directorio): incorporar la verificación de información`. Sin secretos, .env reales, credenciales, fixtures, bases runtime, capturas ni build output versionados. Los únicos cambios de documentación previa mantienen reproducible el selector 2.4. El usuario autorizó expresamente versionar únicamente 2.5 con resumen y validaciones en español, para comenzar 2.6 desde un working tree limpio. Sin push.

Listado exacto de archivos (M = modificado; A = nuevo), relativo a la raíz del repositorio:

- M `apps/api/prisma/schema.prisma`
- M `apps/api/src/modules/audit/audit.service.ts`
- M `apps/api/src/modules/auth/authorization/authorization.spec.ts`
- M `apps/api/src/modules/auth/authorization/permission.ts`
- M `apps/api/src/modules/auth/authorization/role-permissions.ts`
- M `apps/api/src/modules/directory/contacts.service.ts`
- M `apps/api/src/modules/directory/directory.module.ts`
- M `apps/api/src/modules/directory/people.service.ts`
- M `apps/api/test/password-reset.integration-spec.ts`
- M `apps/api/test/users-administration.integration-spec.ts`
- M `apps/web/src/app/router/app-routes.tsx`
- M `apps/web/src/app/router/navigation.ts`
- M `apps/web/src/features/directory/contact-associations.tsx`
- M `apps/web/src/features/directory/contacts.test.tsx`
- M `apps/web/src/features/directory/directory-history.test.tsx`
- M `apps/web/src/features/directory/directory.test.tsx`
- M `apps/web/src/features/directory/organization-detail-page.tsx`
- M `apps/web/src/features/directory/people.test.tsx`
- M `apps/web/src/features/directory/person-detail-page.tsx`
- M `apps/web/src/features/directory/person-relations.tsx`
- M `apps/web/src/features/directory/queries.ts`
- M `apps/web/src/lib/api/client.ts`
- M `docs/subfase-2.4-historial.md`
- M `infra/development/validate-directory-migrations.cjs`
- A `apps/api/prisma/migrations/20261002231000_verification_settings_action/migration.sql`
- A `apps/api/prisma/migrations/20261002231100_directory_verifications/migration.sql`
- A `apps/api/src/modules/directory/verification.controller.ts`
- A `apps/api/src/modules/directory/verification.dto.ts`
- A `apps/api/src/modules/directory/verification.rules.spec.ts`
- A `apps/api/src/modules/directory/verification.rules.ts`
- A `apps/api/src/modules/directory/verification.service.ts`
- A `apps/api/src/modules/settings/settings.module.ts`
- A `apps/api/src/modules/settings/verification-settings.controller.ts`
- A `apps/api/src/modules/settings/verification-settings.dto.ts`
- A `apps/api/src/modules/settings/verification-settings.service.ts`
- A `apps/api/test/verification.integration-spec.ts`
- A `apps/web/src/features/directory/verification-panel.tsx`
- A `apps/web/src/features/directory/verification.contracts.ts`
- A `apps/web/src/features/directory/verification.test.tsx`
- A `apps/web/src/features/settings/verification-settings-page.tsx`
- A `docs/subfase-2.5-verificacion.md`
