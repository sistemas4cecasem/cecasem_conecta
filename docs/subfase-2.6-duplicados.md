# SUBFASE 2.6 — RESULTADO FINAL

## Estado

**SUBFASE 2.6 COMPLETADA.** Implementación y aceptación local verificadas el 2 de octubre de 2026, zona America/La_Paz. Los datos del recorrido fueron ficticios y se retiraron al terminar.

## Baseline

Rama `main`, HEAD `4fe3124a9cface2800f46370ba3f14d56026a2df`, commit `feat(directorio): incorporar la verificación de información`. El usuario autorizó expresamente este commit pendiente de 2.5, con resumen y validaciones en español; no incluyó cambios de 2.6 ni push. Se verificó el working tree limpio antes de empezar 2.6.

Baseline: 15 migraciones; 322 pruebas API, 190 frontend y 561 PostgreSQL/HTTP: **1.073**. Se inspeccionaron las instrucciones raíz/API/web y los modelos, permisos, contactos, episodios, historial, verificaciones y validadores existentes.

## P0 correo exacto

RF-26 permanece protegido por el índice parcial único `ContactMethod_email_unique`, normalización trim/lowercase, conflicto público `CONTACT_EMAIL_EXISTS`, consulta del canal y sus asociaciones, confirmación explícita de reutilización e idempotencia. Compartir el canal no implica identidad de personas u organizaciones. Las reglas de correo de 2.3 y sus migraciones permanecen intactas.

## Implementado

- Candidatos persistidos con pareja canónica de organizaciones o personas, puntuación, señales, versiones examinadas, estado, autor y fecha de resolución.
- Similitud de nombres/siglas e iniciales compatibles; comparación con contexto institucional.
- Descarte explícito por los cuatro roles, sin editar ni verificar fichas.
- Vista previa y consolidación administrativa con principal elegido, tres confirmaciones en UI y comprobaciones autoritativas en backend.
- Conservación de ambas fichas y sus referencias históricas; bloqueo de escrituras ordinarias en la consolidada y enlace al principal.
- Reconciliación trazada de categorías, contactos activos y episodios vigentes; acceso a la evidencia original.
- Auditoría tipada, historial de cambios efectivos, atomicidad y control de concurrencia.
- UI con paginación, permisos, loading/error/retry, conflictos, decisiones anteriores e invalidación de caché por identidad y capabilities.

Rutas REST bajo `/api/v1`: GET `duplicate-candidates`, GET `organizations/:id/duplicate-candidates`, GET `people/:id/duplicate-candidates`, POST `duplicate-candidates/:id/dismiss`, GET `duplicate-candidates/:id/consolidation-preview?principalId=…`, POST `duplicate-candidates/:id/consolidate`. DTOs estrictos, UUID, versiones positivas y respuestas públicas sin internals; GET con `Cache-Control: no-store`.

## Decisiones efectivamente tomadas

**Algoritmo:** Unicode NFD sin diacríticos, minúsculas, puntuación como separación y espacios compactados, exclusivamente para comparar. Los textos originales se preservan. Se forman conjuntos de trigramas de palabras con dos espacios iniciales y uno final. Dice = `2 × intersección / suma de tamaños`; se toma el máximo entre nombres y siglas/nombres alternativos de organizaciones, o nombre de presentación y nombres/apellidos separados de personas. No se eliminan palabras institucionales.

**Umbrales:** organizaciones `0,62`; personas `0,65`. Una abreviatura personal con mismo primer y último token, igual cantidad de tokens e iniciales intermedias compatibles eleva la señal a `0,82`. La puntuación se conserva con cuatro decimales y representa proximidad textual, nunca probabilidad de identidad. Los países distintos y una matriz añaden advertencias; no excluyen candidatos. Estado, categorías, verificación y contacto compartido no prueban identidad.

Calibración en 28 pruebas de reglas: Fundación Esperanza/Fundacion Esperanza = coincidencia; variante Bolivia, Oficina Bolivia y Esparanza = candidatas; Universidad de La Paz/Cooperativa Agrícola del Norte, Fundación Esperanza/Fundación Desarrollo, Banco Unión/Banco Mundial y ONG Futuro/Instituto Técnico Central = no candidatas. María Fernanda Pérez/Maria F. Perez = `0,82`; acentos equivalentes = coincidencia. Ana Rodríguez/Carlos Gutiérrez, María Fernanda Pérez/Maria Gabriela Gomez y Juan Perez/Juan Torres = no candidatas. La sede del recorrido obtuvo aproximadamente 71 % frente a la matriz: contexto para revisar, sin consolidación automática.

**pg_trgm: no.** No se instala extensión, no se solicita superusuario ni se elevan privilegios de la cuenta de aplicación. Se utiliza TypeScript/Node existentes, sin dependencias nuevas. Reevaluación explícita al consultar la ficha: lectura por cursor de 200 registros no consolidados, incluyendo activos/inactivos y países distintos. Coste lineal por ficha y transacción con límite de 30 segundos; se privilegia una implementación básica verificable. No se implementa un barrido global, scheduler o limpieza masiva. La similitud puede producir falsos positivos/negativos y siempre exige criterio humano.

**Lifecycle:** `PENDING` → `NOT_DUPLICATE` o `CONSOLIDATED`. La pareja se ordena por UUID A < B. Dos huellas SHA-256 representan información normalizada relevante: nombre/sigla/país/matriz para organizaciones; presentación/nombres/apellidos para personas. Un descarte de las mismas huellas no reaparece por cambiar descripción, estado o versión técnica. Cambiar información relevante permite una nueva evaluación conservando la resolución anterior. Los pending antiguos permanecen como desactualizados; se impide resolverlos. Una consulta explícita actualiza las versiones examinadas del pending que conserve las mismas huellas e incrementa su versión.

**Versiones:** cada decisión exige `expectedCandidateVersion`, `expectedVersionA` y `expectedVersionB`. La consolidación también exige un token SHA-256 de la vista previa completa: fichas, asociaciones, episodios, categorías, jerarquía, verificaciones y configuración. Así se detectan cambios de referencias que no incrementan la versión de ficha. Repetir exactamente un descarte devuelve la primera resolución sin modificar autor, fecha o versión.

**Representación:** `duplicateOfId` con FK a la misma clase de actor. Se conserva el registro consolidado; no se desactiva automáticamente ni se borra. La aplicación impide autoconsolidación, ciclos y cadenas, incluyendo usar como duplicado un principal que ya tenga fichas consolidadas. El principal puede recibir otras fichas directamente. Se conservan nombre, país, sigla y demás campos propios del principal; no se sobrescriben por similitud.

**Referencias:** no se reescriben FK históricas. Se mantiene la clasificación original y se añade al principal la unión de categorías. Cada contacto activo se añade o reutiliza por medio canónico; un conflicto conserva el contexto del principal y el original en su ficha. Una asociación principal inactiva se reactiva únicamente mediante la confirmación administrativa descrita en la vista previa. No se modifica valor, tipo, etiqueta, condición ni `valueVersion` del medio global. Su versión técnica aumenta al añadir asociación, conforme a la protección concurrente de medios compartidos de 2.3.

Los episodios vigentes se representan en el principal mediante una decisión explícita: reutilizar uno equivalente en todos sus campos o crear una representación con las mismas fechas, cargo, área y fuente, registro actual y procedencia tipada. Los episodios diferentes se conservan separados y los anteriores no se trasladan. El episodio original conserva sus FK y datos. Si el otro participante ya fue consolidado, se resuelve su principal directo para la representación operativa. `DuplicateReconciliation` registra source/target reales, versiones y resultado `CREATED`, `REUSED` o `KEPT_PRINCIPAL`.

Ninguna verificación se mueve, copia ni fabrica. Contactos/episodios añadidos quedan sin verificar. Ambas fichas incrementan versión por el cambio efectivo de relación principal/duplicado; un principal anteriormente verificado requiere revisión propia. La fecha anterior se conserva.

## Modelo

`DuplicateCandidate`: UUID, exactamente una pareja tipada de la misma clase, FK reales, orden A < B, unicidad parcial por pareja/huellas, versiones positivas, puntuación 0–1 y estados con autor/fecha/principal coherentes. Un principal de candidato consolidado debe pertenecer a su pareja.

`DuplicateReconciliation`: FK al candidato, exactamente un par source/target de asociación personal, institucional o episodio; source distinto de target, versiones positivas, unicidad por candidato/source e índices de consulta por destino.

Organizaciones y personas: FK `duplicateOfId`, CHECK contra referencia a sí misma e índice. Ciclos/cadenas y jerarquía se protegen en el caso de uso con locks y pruebas de concurrencia. No se añade un trigger que reescriba referencias.

`AuditEvent`: acción `DUPLICATE_CONSOLIDATED`, candidato y par principal/duplicado con FK de organización o persona, usuario y operación. CHECK exige una sola familia de objetivos y excluye los campos de administración, contraseñas y configuración. Las familias anteriores siguen exigiendo sus combinaciones previas y los nuevos campos NULL.

`DirectoryChange`: nuevos campos `duplicateOfOrganizationId`, `duplicateOfPersonId`, `consolidatedOrganizationIds` y `consolidatedPersonIds`, con objetivos/tipos coherentes. Snapshots preservan etiquetas al momento de la decisión. Se registra cada mutación efectiva y ningún no-op. Las fichas comparten operationId de consolidación; las altas/reactivaciones de contactos y episodios tienen sus propias operaciones, enlazadas por la reconciliación/candidato, respetando la unicidad existente de historial.

## RBAC

| Acción | Administrador | Directorio | Búsqueda | Planificación |
| --- | --- | --- | --- | --- |
| Leer candidatos (`directory.read`) | Sí | Sí | Sí | Sí |
| Descartar (`directory.duplicates.dismiss`) | Sí | Sí | Sí | Sí |
| Vista previa/consolidar (`directory.duplicates.manage`) | Sí | No | No | No |

Guards HTTP y comprobación del usuario activo/rol vigente en decisiones transaccionales. No se depende de botones ocultos. Las consultas administrativas de preview se retiran de caché al perder manage; cambio de identidad/logout cancela y elimina las consultas de esa sesión.

## Migraciones

1. `20261003010000_duplicate_audit_action`: añade solo el valor del enum de auditoría.
2. `20261003010100_directory_duplicates`: tablas, columnas, FK, índices y CHECK; transacción BEGIN/COMMIT.

Las primeras 15 migraciones no se modificaron. Total: **17**. Validación limpia 0→17 y upgrade 15→17 aprobados; comparación preserva **18 tablas**, incluidos cinco objetivos de verificación, configuración no predeterminada, historial/snapshots y auditoría. La cuenta runtime `cecasem` continúa sin superusuario, CREATEDB ni CREATEROLE. Deploy y migrate status aprobados en runtime, sin reset de volúmenes.

El validador sin selector o con `--phase=2.6` reproduce esta subfase. Todos los selectores históricos fueron ejecutados:

| Selector | Upgrade | Tablas preservadas | Resultado |
| --- | --- | --- | --- |
| `--phase=2.1` | 6→8 | 7 | Aprobado |
| `--phase=2.2` | 8→10 | 11 | Aprobado |
| `--phase=2.3` | 10→12 | 13 | Aprobado |
| `--phase=2.4` | 12→13 | 16 | Aprobado |
| `--phase=2.5` | 13→15 | 16 | Aprobado |
| `--phase=2.6` / sin selector | 15→17 | 18 | Aprobado |

Cada selector también verifica instalación limpia hasta su objetivo. Se actualizó la documentación anterior únicamente para indicar el selector explícito de reproducción de 2.5. Las bases y staging de migraciones son temporales y se retiran por el validador. No se utilizó extensión PostgreSQL adicional.

## Pruebas

| Grupo | Baseline | Final | Diferencia |
| --- | --- | --- | --- |
| API unitarias/e2e sin PG, 24 suites | 322 | **360** | +38 |
| Frontend, 14 archivos | 190 | **222** | +32 |
| PostgreSQL/HTTP real, 13 suites | 561 | **594** | +33 |
| Total, sin contar repeticiones | 1.073 | **1.176** | **+103** |

Nuevas pruebas: 28 reglas de similitud + 10 decisiones/versiones; 33 PostgreSQL/HTTP de duplicados; 28 UI de candidatos/consolidación + 4 API client de ruta pública segura. Cubren estados, UUID/DTO, FK, unicidad, permisos, fechas civiles, procedencia, preview obsoleta, rollback completo, jerarquía y carreras. Las assertions anteriores se conservaron; sus fixtures responden al nuevo endpoint de candidatos y sus proyecciones incluyen los nuevos campos públicos.

## RF-26

La suite previa de contactos pasó completa, incluyendo normalización, unicidad SQL, carreras, reutilización/idempotencia, contextos separados, condición global y corrección compartida. El nuevo caso de duplicados repite la carrera de creación de EMAIL y la reutilización. En el recorrido, `  MARIA.QA26@example.test  ` se normalizó a un único medio canónico `maria.qa26@example.test`; después de consolidar permaneció **1 medio / 2 asociaciones** con contextos y verificaciones independientes.

## RF-27

Organizaciones similares y María Fernanda Pérez/Maria F. Perez aparecen como posibles coincidencias. La UI muestra porcentaje y señales, permite comparar y enlaza ambas fichas; no afirma identidad confirmada ni obliga a consolidar. La creación nunca fusiona por nombre. En el recorrido se observaron 100 % para la variante sin tilde y 82 % para iniciales personales.

## RF-28

Solo Administración puede elegir principal, obtener los efectos y confirmar consolidación. Pruebas HTTP devuelven 401 sin sesión y 403 para los tres roles no administrativos; DTOs rechazan campos/versiones/confirmaciones ausentes. La operación conserva historial y referencias, audita con objetivos tipados y revierte completamente ante fallo de auditoría. La consolidada sigue siendo consultable y sus escrituras ordinarias reciben 409 con una ruta pública validada al principal.

## Consolidación

Ejemplo real ejecutado en navegador: principal **María Fernanda Pérez**, duplicado **Maria F. Perez**. Antes: el duplicado tenía correo contextual, episodio Coordinadora en Fundación Esperanza desde `2020-01-01`, y tres verificaciones independientes de persona/contacto/vínculo realizadas por QA26 Búsqueda Temporal.

Administración eligió el principal, revisó la evidencia y confirmó los tres puntos. Después: ambas fichas accesibles; duplicado con banner y enlace al principal, sin controles ordinarios de edición/alta/verificación. El principal conserva su nombre completo y muestra una asociación al mismo correo y una representación del episodio con enlaces a la evidencia original. Esos objetos y el principal permanecen **Nunca verificado**. Las tres verificaciones anteriores siguen en la ficha/objetos originales; no se crearon eventos en el principal.

Se comprobaron en PostgreSQL dos puentes de reconciliación, dos asociaciones, dos episodios y un correo canónico. Auditoría personal: operación `4605e5bc-e9e9-4d59-acbb-bfe7aa361dc6`, candidato `fb0763dd-c63e-4e9d-8651-6800a8274310`, fecha local 2/10/2026 20:01:11, Administración QA. El historial conserva las etiquetas originales y se presenta como **Consolidación de fichas**, no sustitución de canal.

También se consolidó **Fundacion Esperanza** en **Fundación Esperanza** con selección/preview/confirmaciones. Operación `0ade7900-2bf1-4762-800f-6e4851a64bfb`, candidato `3dcefaca-db64-47aa-bdb9-1cb76e8bada9`, fecha local 2/10/2026 22:18:27. La sede siguió referenciando a su matriz original. Los IDs describen evidencia QA retirada, no enlaces activos de negocio.

## Matriz/sede

La oficina legítima Fundación Esperanza — Oficina Bolivia se creó con matriz explícita. Comparación muestra país, sigla y matriz. Búsqueda la descartó como distinta; recargar no reprodujo esa decisión. Cambiar la sigla generó nueva evaluación conservando el descarte. Administración abrió después la vista previa matriz/sede y encontró advertencia y confirmación deshabilitada.

El backend rechaza colapsar matriz/sede, ciclos, matrices con hijos como duplicadas o fichas de matrices diferentes. No mueve hijos. La elección inversa que afectaría una matriz tampoco permite confirmar. Tres casos PostgreSQL de jerarquía y el recorrido confirman el comportamiento.

## Concurrencia

Detección/resolución/consolidación usan exclusión transaccional; escrituras ordinarias comparten el lock de calidad. Orden: calidad → jerarquía cuando aplica → actores ordenados por UUID → candidato → medios/asociaciones. La exclusión hace determinista la revisión de referencias; los locks compartidos mantienen las carreras normales de edición/contactos de fases anteriores.

Pruebas: dos reevaluaciones en sentidos opuestos crean una pareja; dos descartes simultáneos conservan exactamente una resolución idempotente; dos administradores que eligen principales opuestos logran una sola consolidación y un conflicto recuperable, sin cadena ni estados parciales. Edición de ficha, asociación o vínculo después de preview impide confirmar la vista anterior. Un fallo de auditoría revierte fichas, asociaciones, episodios, puentes, historial y candidato.

## Validaciones

| Validación ejecutada | Resultado |
| --- | --- |
| `yarn lint` | Aprobado, Windows |
| `yarn typecheck` | Aprobado, Windows |
| `yarn test` raíz | Aprobado, Docker Linux: 360 API + 222 web |
| `yarn workspace @cecasem-conecta/web test` | Aprobado también en Windows |
| `yarn build` raíz | Aprobado, Windows; warning de bundle descrito abajo |
| `yarn workspace @cecasem-conecta/api prisma:generate` | Aprobado durante scripts de validación/build/tests |
| `yarn workspace @cecasem-conecta/api prisma:validate` | Aprobado |
| `yarn workspace @cecasem-conecta/api prisma:migrate:status` | Aprobado, 17 migraciones en QA/runtime |
| `yarn workspace @cecasem-conecta/api test:integration` | Aprobado, Docker Linux/PG real: 594 |
| Validador de migraciones limpio/upgrade y selectores históricos | Aprobado |
| Docker build migrations/API/web | Aprobado, instalación Yarn immutable |
| `prisma:migrate:deploy` mediante Compose de migraciones | Aprobado con cuenta runtime, sin elevar privilegios |
| `docker compose up -d --wait` | Aprobado; API/web/db healthy |
| GET local `/api/v1/health` | `{ status: "ok", database: "ok" }` |
| Recorrido real, 390 px y limpieza | Aprobado |
| Revisión de diff, archivos, secretos y `git diff --check` | Aprobado |

No se modificaron versiones, configuración de seguridad, Dockerfiles, Compose ni lockfile para hacer pasar las pruebas.

## Aceptación funcional

Se ejecutaron los 20 puntos requeridos: crear organizaciones similares; ver candidatura; crear sede con matriz; comparar contexto; descartar con Búsqueda; comprobar persistencia; cambiar sigla; reevaluar conservando decisión anterior; crear personas similares; compararlas; cambiar a Administración; abrir revisión; elegir principal explícito; obtener preview y consolidar; consultar ficha antigua/enlace; comprobar historial y auditoría; referencias; independencia de verificaciones; ancho 390 px.

Además se registraron por UI el contacto y episodio, se corroboraron explícitamente sus tres objetos y se repitió consolidación de organizaciones. La inspección del principal y la ficha histórica pasó a 390 px: viewport solicitado 390, scrollWidth del documento 375, sin overflow horizontal; controles apilados y evidencia legible. Las fechas civiles se presentan como `2020-01-01`, sin desplazamiento por zona horaria, y una fecha final desconocida no aparece como una verificación faltante.

Capturas ficticias fuera de Git: `qa26-duplicados-390.png`, `qa26-principal-390.png` y `qa26-consolidada-390.png`, en el directorio de visualizaciones de esta conversación. Logout y viewport restaurado; pestaña abierta en login. Limpieza acotada por UUID de las 3 organizaciones, 2 personas, 1 canal y 2 usuarios QA, con referencias temporales; comparación de IDs/conteos restituye el baseline de 13 tablas. Verificaciones/configuración reales no alteradas. Se retiraron credenciales/scripts temporales y el contenedor de pruebas. API/web/db permanecen healthy.

## Bundle

JS final **538,69 kB minificado / 155,79 kB gzip**. CSS **13,69 kB / 3,59 kB gzip**. Frente a 2.5, JS +20,73 kB minificado / +4,51 kB gzip (aproximadamente 4,0 % / 3,0 %). Persiste el warning de chunk >500 kB; no bloquea el build. No se ocultó el warning ni se emprendió una optimización general ajena a la subfase.

## Argon2/Windows

Persistió el bloqueo ambiental Windows 4551 del binario Argon2: el intento de suite API en ese entorno falló en las cinco pruebas de contraseña. No se redujo ni sustituyó Argon2id. La suite raíz completa y PostgreSQL/HTTP se ejecutaron y aprobaron en Docker Linux con el mismo código y Yarn lock. Frontend, lint, tipos y build aprobaron también en Windows.

## Regresiones

Ninguna pendiente en las suites finales. Durante desarrollo, un lock inicialmente exclusivo para todas las escrituras interfería con barreras de concurrencia previas; se corrigió a compartido para escrituras ordinarias, exclusivo para calidad. Se mantuvieron las assertions y las carreras previas pasan. Una corrida concurrente con builds/tests sufrió un timeout de transporte PostgreSQL; la suite de personas aislada y posteriormente las 13 suites completas sin carga paralela aprobaron sin modificar timeouts.

El recorrido detectó y corrigió fecha civil desplazada en preview y etiquetas de historial que confundían consolidación con sustitución de contacto. Se añadieron pruebas de regresión de esos comportamientos.

## Pendientes

Sin pendientes funcionales de 2.6. Los límites explícitos del algoritmo lineal básico, el warning de bundle y el bloqueo Argon2 del host se describen arriba; las validaciones completas requeridas están aprobadas.

## Fuera de alcance respetado

Sin búsqueda combinada/módulo search, barridos globales, scheduler, dashboard, importación/exportación, notificaciones, procesos, comunicaciones, adjuntos, oportunidades, reuniones ni traducción. Sin fusiones automáticas, borrado de fichas, reescritura masiva de FK, traslado de verificación o de fuentes históricas. Sin dependencias nuevas, extensiones PostgreSQL, elevación de privilegios, refactors generales o actualización de Notion. No se inició 2.7 ni se generó su prompt.

## Estado Git

HEAD permanece `4fe3124a9cface2800f46370ba3f14d56026a2df`. **40 archivos modificados y 18 nuevos, 58 en total**, exclusivamente de 2.6 y su documentación/reproducción. Working tree con cambios revisados y sin staging; **sin commit de 2.6 y sin push**. El commit autorizado de 2.5 es el baseline anterior. No se incluyen `.env`, credenciales reales, tokens privados, uploads, bases/runtime, capturas ni artefactos QA. `package.json` y `yarn.lock` permanecen intactos.

Listado exacto de archivos (M = modificado, A = nuevo):

- M `apps/api/prisma/schema.prisma`
- M `apps/api/src/modules/audit/audit.service.ts`
- M `apps/api/src/modules/auth/authorization/authorization.spec.ts`
- M `apps/api/src/modules/auth/authorization/permission.ts`
- M `apps/api/src/modules/auth/authorization/role-permissions.ts`
- M `apps/api/src/modules/directory/contacts.service.spec.ts`
- M `apps/api/src/modules/directory/contacts.service.ts`
- M `apps/api/src/modules/directory/directory-error.filter.ts`
- M `apps/api/src/modules/directory/directory-history.contract.ts`
- M `apps/api/src/modules/directory/directory-history.service.ts`
- M `apps/api/src/modules/directory/directory.errors.ts`
- M `apps/api/src/modules/directory/directory.module.ts`
- M `apps/api/src/modules/directory/directory.service.ts`
- M `apps/api/src/modules/directory/people.service.spec.ts`
- M `apps/api/src/modules/directory/people.service.ts`
- M `apps/api/src/modules/directory/verification.service.ts`
- M `apps/api/test/password-reset.integration-spec.ts`
- M `apps/api/test/users-administration.integration-spec.ts`
- M `apps/web/src/features/directory/contact-associations.tsx`
- M `apps/web/src/features/directory/contact-create-form.tsx`
- M `apps/web/src/features/directory/contact-detail-page.tsx`
- M `apps/web/src/features/directory/contact-section.tsx`
- M `apps/web/src/features/directory/contacts.contracts.ts`
- M `apps/web/src/features/directory/contacts.test.tsx`
- M `apps/web/src/features/directory/contracts.ts`
- M `apps/web/src/features/directory/directory-history-format.ts`
- M `apps/web/src/features/directory/directory-history.test.tsx`
- M `apps/web/src/features/directory/directory-history.tsx`
- M `apps/web/src/features/directory/directory-ui.tsx`
- M `apps/web/src/features/directory/directory.test.tsx`
- M `apps/web/src/features/directory/organization-detail-page.tsx`
- M `apps/web/src/features/directory/people.test.tsx`
- M `apps/web/src/features/directory/person-detail-page.tsx`
- M `apps/web/src/features/directory/person-relations.tsx`
- M `apps/web/src/features/directory/queries.ts`
- M `apps/web/src/features/directory/verification.test.tsx`
- M `apps/web/src/lib/api/client.test.ts`
- M `apps/web/src/lib/api/client.ts`
- M `docs/subfase-2.5-verificacion.md`
- M `infra/development/validate-directory-migrations.cjs`
- A `apps/api/prisma/migrations/20261003010000_duplicate_audit_action/migration.sql`
- A `apps/api/prisma/migrations/20261003010100_directory_duplicates/migration.sql`
- A `apps/api/src/modules/directory/consolidation-provenance.ts`
- A `apps/api/src/modules/directory/consolidation.service.ts`
- A `apps/api/src/modules/directory/directory-actor.policy.ts`
- A `apps/api/src/modules/directory/duplicate-detection.service.ts`
- A `apps/api/src/modules/directory/duplicate-detection.spec.ts`
- A `apps/api/src/modules/directory/duplicates.controller.ts`
- A `apps/api/src/modules/directory/duplicates.dto.ts`
- A `apps/api/src/modules/directory/duplicates.rules.spec.ts`
- A `apps/api/src/modules/directory/duplicates.rules.ts`
- A `apps/api/test/duplicates.integration-spec.ts`
- A `apps/web/src/features/directory/consolidation-provenance.tsx`
- A `apps/web/src/features/directory/consolidation-review.tsx`
- A `apps/web/src/features/directory/duplicate-panel.tsx`
- A `apps/web/src/features/directory/duplicates.contracts.ts`
- A `apps/web/src/features/directory/duplicates.test.tsx`
- A `docs/subfase-2.6-duplicados.md`
