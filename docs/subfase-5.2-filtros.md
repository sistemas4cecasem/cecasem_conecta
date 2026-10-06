# Subfase 5.2 — Filtros institucionales (RF-69)

## Baseline y alcance

Rama `main`, HEAD `0a0a05e7f192dad7cb99e53248065291801ac603`.
Los 17 archivos modificados y seis nuevos de 5.1 continuaban sin commit. Se
conservan sus funcionalidades y el manifiesto de `subfase-5.1-busqueda-global.md`.
5.2 añade filtros a organizaciones y al grupo institucional de la búsqueda
existente; no redefine filtros de personas, procesos, oportunidades o reuniones.
No implementa 5.3+, ni cambia dependencias, schema, permisos o infraestructura.

## Contrato

`GET /api/v1/organizations` conserva nombre, estado, matriz, categoría y
paginación, y añade:

| Parámetro | Semántica |
| --- | --- |
| `country` | País completo, 1–150 caracteres, trim y espacios normalizados; comparación sin distinguir mayúsculas. No elimina acentos ni usa catálogo externo. País nulo no coincide. |
| `verificationStatus` | `CURRENT`, `REVIEW_DUE`, `NEVER_VERIFIED`, los términos existentes. |
| `withCommunications` | Boolean estricto `true`/`false`: presencia/ausencia de antecedentes externos del actor principal. |

Categoría continúa como `categoryId` UUID. La consulta Prisma existente conserva
`categories.some.categoryId` cuando no se solicitan criterios nuevos. Cuando se
combinan, el equivalente SQL es `EXISTS` sobre `OrganizationCategory`, sin
duplicar organizaciones multiclase. `status=active|inactive|all` mantiene su
significado anterior; el valor predeterminado del listado es `active`.

`GET /api/v1/search` conserva íntegramente la respuesta y los grupos de 5.1.
Los filtros se delimitan explícitamente mediante `organizationCountry`,
`organizationCategoryId`, `organizationStatus`, `organizationVerificationStatus`
y `organizationWithCommunications`. Solo reducen `organizations`; no suprimen
personas, procesos, asociaciones de correo ni `emailHistory`, incluido el correo
histórico sin ContactMethod. El estado institucional interseca la regla previa
`includeInactive`: para consultar fichas inactivas se debe habilitar también
ese criterio. La excepción previa de ficha consolidada por nombre exacto se
conserva y también está sujeta a los filtros institucionales.

Omitir un criterio no restringe. País/categoría inexistentes válidos devuelven
lista vacía. País vacío, UUID vacío/inválido, enum vacío/inválido y boolean distinto
de `true`/`false` producen 400. Nombre vacío conserva la semántica previa de no
restringir. Los criterios inválidos no se convierten en consultas amplias.

## Verificación

La proyección SQL reside en `verification.rules.ts`, junto a la regla existente,
y se contrasta contra `VerificationService.status` en PostgreSQL. Consulta el
evento más reciente por `verifiedAt DESC, id DESC`, compara `objectVersion` con
la versión actual y suma meses calendario UTC con límite de fin de mes.
La igualdad con la fecha de revisión ya exige revisión.

`CURRENT` exige evento, misma versión y plazo vigente. `REVIEW_DUE` exige evento
y cambio de versión o vencimiento. `NEVER_VERIFIED` exige ausencia de evento;
no se confunde con revisión vencida. Ni `createdAt` ni `updatedAt` sustituyen
verificación. La proyección `lastVerifiedAt` sola no decide el filtro.

Se consulta `VerificationSettingsService` en la transacción: inicialmente 12
meses institucionales. La regla personal existente de seis meses permanece
vigente, aunque estos filtros se delimitan a organizaciones. Cambiar el intervalo
administrativo recalcula condiciones sin reescribir evidencias.

## Comunicaciones y autorización

Se elige **alguna vez hubo comunicación histórica**, coherente con la conservación
de antecedentes de 5.1. Cuenta SENT/RECEIVED, VALID/INVALIDATED, a través del
proceso cuyo actor principal es la organización. No infiere comunicaciones por
un correo del Directorio, un vínculo de una persona ni una nota interna. El actor
con solo antecedentes invalidados tiene comunicaciones históricas; esto no
acredita último contacto válido ni modifica el resumen RF-68.

La proyección pública de Communications devuelve un EXISTS acotado, reutilizado
por Directory. No se importan módulos en ciclo ni se realizan escrituras cruzadas.
Se mantienen sesión y `directory.read`; presencia y ausencia de comunicaciones
exigen además `relationships.process.read` y `communications.read`, revalidados
con usuario activo dentro de la transacción. Sin esos permisos se devuelve 403,
incluso para ausencia, antes de producir una proyección sensible. No se agregan
permisos ni excepciones por participación; la lectura histórica existente es
transversal y distinta de la autorización de escritura/cierre.

## Consultas y rendimiento

Todos los criterios independientes se combinan con AND. La consulta SQL de IDs
paginados y total deriva de un único CTE `matches` en RepeatableRead; la proyección
de fichas descarga únicamente los IDs de la página. La búsqueda normalizada
existente incorpora el mismo predicado institucional antes de ranking y conteo.
No se filtran colecciones completas en Node o React, ni se consulta una regla
por cada fila. La prueba de cantidad de llamadas PostgreSQL es constante entre
una y varias filas.

EXPLAIN ANALYZE/BUFFERS ejecutado en base QA con 3.031 organizaciones, 1.500
asociaciones de categoría nuevas y 1.000 verificaciones nuevas: cinco criterios,
con comunicaciones 0,262 ms y sin comunicaciones 2,332 ms de ejecución SQL.
Se utilizaron índices existentes de Organization, Verification, RelationshipProcess
y Communication. Son mediciones locales con datos sintéticos, no una garantía
para cualquier cardinalidad. No hay evidencia que justifique un índice nuevo.

## Interfaz

El selector paginado de categorías existente se reutiliza en ambos ámbitos;
conserva selección al recorrer el catálogo e incluye categorías inactivas.
Los controles muestran país, estado, condición y antecedentes externos, permiten
limpiar y aclaran alcance e invalidaciones. Los parámetros se conservan en URL
al recargar y usar atrás/adelante; retirarlos los elimina del query string.
Cambiar filtros reinicia página. La consulta anterior no se mantiene como
placeholder durante una petición nueva.

Las claves de organizaciones incluyen ruta, identidad, rol y capabilities de
lectura relevantes. El saneamiento de sesión cancela y elimina claves antiguas.
Registrar comunicaciones invalida listados institucionales y búsqueda; verificar,
editar fichas/categorías o cambiar intervalos reutiliza invalidación Directory.
Se distinguen loading, vacío y error recuperable.

Recorrido real: sesión Planificación ficticia; combinación país/categoría/revisión/
ausencia encuentra ficha modificada con solo nota; recarga conserva selección;
presencia produce vacío y Atrás restaura; limpiar elimina criterios; presencia
incluye antecedente invalidado; página dos funciona; búsqueda institucional
mantiene tres procesos y el historial de correo sin ContactMethod; logout.
Escritorio y móvil sin overflow horizontal. El adaptador solicitado a 390×844
usa escala de interfaz: para verificar ancho CSS real 390 se ajustó su tamaño;
el runtime reportó 390×843 (redondeo de altura). Controles y resultados fueron
inspeccionados visualmente y operados. Consola sin errores/advertencias.

## Validaciones

- `yarn lint`, `yarn typecheck`, `yarn test`, `yarn build`: aprobados.
- API: 903 pruebas / 50 suites; frontend: 602 / 34 archivos.
- Integración completa: 1.272 pruebas / 33 suites, en cuatro grupos disjuntos:
  702/14, 258/7, 207/7 y 105/5. Sin aumentar heap ni timeouts.
- Nuevas pruebas 5.2: siete API, diez frontend y 33 PostgreSQL/HTTP, total 50.
- RF-12, RF-67 y RF-68 conservan sus pruebas y regresión funcional.
- Prisma validate, migrate status y migrate diff: aprobados; drift cero.
- 54 migraciones aplicadas desde cero sobre PostgreSQL 18.6, rol no superusuario.
- HTTP real: 200/no-store; cinco criterios → una ficha; historial sin contacto
  actual → dos antecedentes, invalidado más reciente y último válido independiente.
- `git diff --check`, revisión de diff y secretos: aprobados al cierre.
- Ninguna migración nueva. No cambian schema, lockfile ni dependencias.

Observaciones P2 previas: advertencias VM Modules, pg y bundle Vite. El bundle
inicial queda en 729,48 kB / 196,52 kB gzip y el chunk de búsqueda en 10,57 /
3,09 kB. No se abordaron estas tareas fuera de alcance. Sin P0/P1 abiertos.

## Manifiesto de 5.2

14 archivos existentes extendidos (siete también pertenecen a 5.1):

- `apps/api/src/modules/directory/directory-search.contract.ts`
- `apps/api/src/modules/directory/directory-search.service.ts` (5.1 + 5.2)
- `apps/api/src/modules/directory/directory.controller.ts`
- `apps/api/src/modules/directory/directory.dto.ts`
- `apps/api/src/modules/directory/directory.module.ts`
- `apps/api/src/modules/directory/directory.service.ts`
- `apps/api/src/modules/directory/verification.rules.ts`
- `apps/api/src/modules/search/search.dto.ts`
- `apps/api/src/modules/search/search.service.ts` (5.1 + 5.2)
- `apps/web/src/features/communications/queries.ts` (5.1 + 5.2)
- `apps/web/src/features/directory/organizations-page.tsx` (5.1 + 5.2)
- `apps/web/src/features/directory/queries.ts` (5.1 + 5.2)
- `apps/web/src/features/directory/search-page.tsx` (5.1 + 5.2)
- `apps/web/src/features/directory/search.test.tsx` (5.1 + 5.2; adaptación del catálogo mock)

Ocho archivos nuevos de 5.2:

- `apps/api/src/modules/communications/communication-filter.projection.ts`
- `apps/api/src/modules/directory/organization-filter.service.ts`
- `apps/api/src/modules/directory/organization-filter.service.spec.ts`
- `apps/api/test/organization-filters.integration-spec.ts`
- `apps/web/src/features/directory/organization-filter.contracts.ts`
- `apps/web/src/features/directory/organization-filters.tsx`
- `apps/web/src/features/directory/organization-filters.test.tsx`
- `docs/subfase-5.2-filtros.md`

Los demás archivos de 5.1 permanecen preservados conforme a su documento.
El conjunto de ambas subfases tiene 24 archivos modificados y 14 nuevos.
No hay commit ni push. Se retiran scripts, sesiones, servidores, contenedor y
volúmenes QA; se conserva el entorno habitual. 5.2 puede cerrarse; 5.3 requiere
su propio alcance y no se inicia automáticamente.
