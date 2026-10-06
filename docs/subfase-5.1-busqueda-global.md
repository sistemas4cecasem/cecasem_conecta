# Subfase 5.1 — Búsqueda global

## Alcance y baseline

Extensión de la búsqueda de Fase 2 sobre `main`, HEAD
`0a0a05e7f192dad7cb99e53248065291801ac603`, árbol inicial limpio.
RF-67 incorpora organizaciones, personas, correo y procesos. RF-68 añade
antecedentes reales por dirección histórica, incluso sin ContactMethod actual.
No se implementan filtros 5.2, dashboard, Excel ni archivo lógico.

## Contrato

Se conserva `GET /api/v1/search?q=...&page=1&pageSize=25&includeInactive=false`,
con el mismo DTO, normalización, límites y campos `query`, `organizations`,
`people`, `email`. Dos campos aditivos:

- `processes`: página de resultados PROCESS por propósito normalizado; contexto
  del actor principal, estado actual, ID y propósito. Incluye procesos cerrados.
  `includeInactive` continúa afectando solo la búsqueda de fichas.
- `emailHistory`: página de comunicaciones por correo exacto, con dirección
  original encontrada, SENT/RECEIVED, VALID/INVALIDATED, `occurredAt`, registrador
  y proceso/contexto. Solo se consulta para un correo completo válido.

Cada grupo tiene su total y usa la página común existente. El ContactMethod
exacto es independiente de la página. `lastValidContact`, dentro de emailHistory,
es la comunicación VALID más reciente por `occurredAt DESC, id DESC`, independiente
de la página. La historia incluye invalidados, pero estos nunca ocupan ese resumen.
Sin comunicaciones, total cero y resumen null. Si solo hay invalidados, se muestran
y se declara explícitamente que no existe contacto válido registrado.

`processes=null` indica falta de acceso al grupo. `emailHistory=null` indica que
la consulta no es un correo o falta acceso. Una página vacía autorizada conserva
su total y metadatos. El frontend acepta la ausencia de campos aditivos para
compatibilidad con consumidores de la respuesta anterior.

## Fronteras y autorización

Search coordina DirectorySearchService, RelationshipSearchService y
CommunicationSearchService; no consulta Prisma. Cada nuevo lector pertenece
al módulo propietario. Relaciones obtiene el contexto del Directorio mediante
DirectoryTargetService.summaries por lote. Comunicaciones obtiene los contextos
de proceso mediante Relaciones, también por lote. No hay dependencia inversa
desde Relaciones hacia Comunicaciones ni ciclos nuevos.

El guard mantiene directory.read. Search revalida usuario activo y rol desde
UsersService y solo solicita grupos permitidos. Los servicios propietarios
revalidan dentro de su transacción RepeatableRead:

- Procesos: directory.read + relationships.process.read.
- Antecedentes: los anteriores + communications.read.

Los cuatro roles vigentes conservan su acceso institucional de lectura. Buscar
no concede participación, permisos de escritura ni excepciones administrativas.
Las proyecciones no incluyen cuerpos, otros destinatarios, credenciales,
fingerprints, notas, rutas físicas o tokens. Todas las respuestas usan no-store.

## Historia y consultas

Se consulta senderNormalizedAddress y CommunicationRecipient.normalizedAddress,
sin depender de ContactMethod ni asociaciones actuales. La dirección mostrada
procede de senderSnapshot o addressOriginal. Un mismo mensaje se cuenta una vez,
aunque la dirección aparezca como remitente y destinatario o en varias clases.
La fecha real no se sustituye por creación, updatedAt o lastActivityAt.

Los índices existentes de remitente/fecha y destinatario/comunicación respaldan
la búsqueda exacta. Las búsquedas parciales normalizadas por nombre/propósito
mantienen el barrido PostgreSQL existente; no se incorpora pg_trgm.

PostgreSQL filtra, ordena, cuenta y pagina. Solo se proyecta la página más el
último contacto válido. Usuarios se cargan como relación acotada; procesos y
actores se obtienen por lotes. No se utiliza el listado ordinario de procesos
ni sus consultas de participación por fila. Cada grupo conserva su snapshot;
la respuesta transversal no promete una instantánea única entre todos los grupos.

## Interfaz

La ruta /directory/search se mantiene y se presenta como Búsqueda global.
Conserva debounce de 350 ms, AbortSignal, estados UI, query params y paginación.
Enlaza fichas, procesos y comunicaciones existentes. El estado del proceso es
su estado actual; la fecha y dirección son las históricas de la comunicación.

La clave de caché incorpora usuario, rol y capabilities de lectura relevantes.
Se retira al cambiar acceso/identidad. Registro, invalidación y cambios de proceso
invalidan búsqueda. El selector reutilizado guarda únicamente organizaciones y
personas, sin almacenar antecedentes transversales que no utiliza.

## Validación

Las pruebas cubren los casos A–H del prompt: búsquedas anteriores, procesos,
correo sin actuaciones, snapshots sin ContactMethod, último contacto por fecha
real, invalidados, salida/entrada, To/CC/BCC, registrador desactivado, autorización,
páginas y consultas constantes al pasar de uno a once procesos/comunicaciones.

Recorrido real con usuario Planificación distinto del registrador en una base
QA separada: organización, persona con vínculo, proceso y correo actual sin
comunicaciones; correo histórico sin ficha, último válido y hecho posterior
invalidado, navegación a detalles. Viewport 390×844: ancho de documento 375,
sin desbordamiento horizontal. Consola consultada sin errores/advertencias.
HTTP real confirmó 200/no-store, página de un antecedente invalidado y último
válido independiente. Ningún dato real de desarrollo se modificó.

Validaciones finales: lint, typecheck, test y build raíz aprobados. API:
896 pruebas/49 suites; frontend: 592/33 archivos; integración PostgreSQL/HTTP:
1.239/32 suites, por los cuatro grupos documentados (304, 285, 297, 353).
La suite específica de búsqueda tiene 45 casos de integración, 19 de coordinación
API y 6 de antecedentes API; la pantalla conserva sus 22 casos y añade 6.
En conjunto se agregan 31 pruebas, sin sumar ejecuciones repetidas.
Prisma validate/status/diff y git diff --check aprobados. Bundle inicial:
726,53 kB / 195,69 kB gzip; chunk diferido de búsqueda: 10,37 / 2,99 kB.

## Archivos

17 modificados y seis nuevos, todos de 5.1:

| Área | Archivos modificados |
| --- | --- |
| API Comunicaciones | `apps/api/src/modules/communications/communications.module.ts` |
| API Directorio | `apps/api/src/modules/directory/directory-search.service.ts`, `directory-target.service.ts` |
| API Relaciones | `apps/api/src/modules/relationships/relationships.module.ts` |
| API Search | `apps/api/src/modules/search/search.controller.ts`, `search.module.ts`, `search.service.ts`, `search.spec.ts` |
| Integración | `apps/api/test/search.integration-spec.ts` |
| Web Directorio | `apps/web/src/features/directory/organizations-page.tsx`, `queries.ts`, `search-page.tsx`, `search.contracts.ts`, `search.test.tsx`, `target-picker.tsx` |
| Web Comunicaciones | `apps/web/src/features/communications/queries.ts` |
| Web Relaciones | `apps/web/src/features/relationships/process-queries.ts` |

Nuevos: `apps/api/src/common/search/search-text.ts`,
`apps/api/src/modules/communications/communication-search.service.ts`,
`apps/api/src/modules/communications/communication-search.service.spec.ts`,
`apps/api/src/modules/relationships/relationship-search.service.ts`,
`apps/api/src/modules/search/search-response.dto.ts` y este documento.

Sin migraciones, cambios de schema, dependencias nuevas, commit ni push.
Las 54 migraciones existentes se aplicaron sobre PostgreSQL 18.6 con rol
de aplicación no superusuario. Los temporales y servidores QA se retiran
al finalizar; las observaciones conocidas de VM Modules, pg y bundle permanecen.
