# SUBFASE 2.7 — RESULTADO FINAL

## Estado

**SUBFASE 2.7 COMPLETADA.** Búsqueda inicial integrada del Directorio, validada con PostgreSQL/HTTP y con el recorrido real en Docker local. Este informe prepara la revisión de Fase 2; no declara su cierre global.

## Baseline

- Rama: `main`.
- HEAD: `546fd6eea4d58f1bca15dbd8d15305c68e6e0026`.
- Commit: `feat(directorio): incorporar la detección y consolidación de duplicados`. Se creó exclusivamente el commit pendiente de 2.6, con autorización expresa, resumen y validaciones en español. Se comprobó el working tree limpio antes de implementar 2.7.
- Migraciones iniciales: **17**.
- Pruebas iniciales de 2.6: **360 API + 222 frontend + 594 PostgreSQL/HTTP = 1176**.
- No se hizo push ni se creó un commit de 2.7.

## Implementado

- Módulo NestJS `search`, endpoint protegido `GET /api/v1/search` y DTO validado.
- Interfaz pública de consultas `DirectorySearchService`, dentro del módulo propietario `directory`, para organizaciones, personas y correo exacto con contexto.
- Pantalla `/directory/search`, accesible desde el Directorio, con grupos tipados, totales, paginación y navegación a las fichas existentes.
- Debounce de 350 ms, cancelación con `AbortSignal`, estados de espera/carga/error/reintento/vacío y protección ante respuestas tardías.
- Consulta y página en la URL. Caché de TanStack Query ligada a identidad y parámetros; reutiliza la invalidación del Directorio y su limpieza al cerrar sesión, cambiar identidad o perder `directory.read`.
- Opción explícita para antecedentes inactivos, identificación de fichas consolidadas y vínculo hacia su principal.
- Consulta de correo canónico con asociaciones vigentes e históricas, sin alterar el flujo existente de detección y reutilización de 2.3.

## Arquitectura

```text
search → servicios públicos de directory → Prisma/PostgreSQL
```

`search` valida y coordina lecturas; no posee tablas, repositorios ni escrituras. Solo `DirectorySearchService`, perteneciente a `directory`, accede a Prisma. Las dependencias son `search → directory/auth`, sin dependencia inversa ni ciclo. Las consultas devuelven proyecciones públicas acotadas, sin notas, fuentes privadas, versiones técnicas, credenciales, tokens o puntuaciones internas.

La búsqueda no crea candidatos, historial, auditorías o verificaciones. Se comprobó en integración que consultar no produce escrituras institucionales.

## Contrato de búsqueda

`GET /api/v1/search?q=...&page=1&pageSize=25&includeInactive=false`

- `q`: texto recortado y espacios repetidos compactados, entre 2 y 254 caracteres. Nombres con un mínimo de dos caracteres normalizados y un máximo de 12 tokens. Si contiene `@`, exige un correo completo válido.
- `page`: entero entre 1 y 10000; `pageSize`: entero entre 1 y 50. `includeInactive` admite estrictamente `true` o `false`.
- Respuesta: `{ query, organizations, people, email }`. Organizaciones y personas tienen `{ items, total, page, pageSize }`; `email` es una coincidencia exacta o `null`.
- Tipos explícitos: `ORGANIZATION`, `PERSON`, `EMAIL`.
- Nombres: comparación parcial por todos los tokens, insensible a mayúsculas y acentos españoles, sobre nombre/alias de organización y nombre visible/nombres-apellidos de persona. No se modifica el texto original almacenado.
- Ranking por grupo: fichas operativas primero; coincidencia exacta antes de prefijo y parcial; desempate por nombre normalizado con colación estable y UUID. No se usa el algoritmo de similitud de duplicados.
- Paginación: una página común para los dos grupos, con totales independientes. La interfaz explica este contrato y usa 25 elementos por grupo; el correo exacto es independiente de esa página.
- Inactivos: excluidos de la búsqueda de nombres por defecto. La opción explícita los incluye e identifica su estado.
- Consolidados: el nombre exacto de la ficha histórica puede recuperarla incluso sin activar antecedentes; se muestra como consolidada, junto al enlace a su principal. La búsqueda parcial ordinaria prioriza y conserva las fichas operativas.
- Contexto: organización con país/alias/matriz; persona con hasta tres vínculos actuales y total; correo con hasta diez asociaciones de personas y diez de organizaciones, estados y totales. Si hay más, se indica y se enlaza al detalle existente.
- Correo: normalización existente de trim y minúsculas, conservando puntos y `+`; búsqueda exacta, sin aproximación. Incluye `USABLE`/`UNUSABLE`, actores inactivos/consolidados y asociaciones terminadas. No afirma que CECASEM haya enviado comunicaciones.
- Seguridad: sesión y `directory.read` en backend, parámetros SQL enlazados, paginación en PostgreSQL y `Cache-Control: no-store`.

Los nombres se normalizan con funciones nativas de PostgreSQL, sin extensiones. PostgreSQL filtra, ordena, cuenta y selecciona los IDs de la página; Node carga únicamente sus proyecciones. Cada grupo mantiene conteo y proyección en una transacción de lectura `RepeatableRead`; los tres grupos no prometen una instantánea global compartida. La búsqueda parcial realiza un barrido lineal en PostgreSQL: es un límite explícito de esta implementación inicial, no una carga completa de actores al navegador o a Node.

## Migraciones

**Ninguna migración nueva.** Permanecen intactas las 17 migraciones, el schema y sus constraints. El correo aprovecha la unicidad parcial existente de EMAIL normalizado; las asociaciones conservan sus índices previos. No se incorporaron `unaccent`, `pg_trgm`, motores externos ni nuevos índices sin evidencia.

La prueba real con 500 coincidencias devolvió 50 filas y total 500 en **49 ms** en el entorno Linux de QA. Es evidencia de ese escenario local, no una garantía de latencia con volúmenes futuros.

## Pruebas

| Suite | Baseline | Final | Nuevas |
| --- | ---: | ---: | ---: |
| API | 360 | 373 | 13 |
| Frontend | 222 | 244 | 22 |
| PostgreSQL/HTTP | 594 | 626 | 32 |
| **Total** | **1176** | **1243** | **67** |

API: 25 suites aprobadas; frontend: 15 archivos aprobados; PostgreSQL/HTTP: 14 suites aprobadas. Conteos sin sumar ejecuciones repetidas.

Las pruebas nuevas cubren validación previa a consultas, normalización, coordinación mediante el servicio público, sesiones/permisos, ranking y desempates, tokens separados, alias, paginación real, inactivos, consolidados, matriz, vínculos actuales, correo exacto no utilizable, asociaciones históricas y límites, ausencia de escrituras, proyección pública y SQL parametrizado. Frontend cubre estados, navegación, URL, cancelación/respuestas fuera de orden, invalidación por mutaciones y retirada de resultados al cambiar sesión o permisos.

## Recorrido final

Ejecutado por UI contra Docker local con cuatro usuarios ficticios, dos personas, una organización y un correo canónico. Fechas mostradas en hora local de Bolivia. Los registros y credenciales QA fueron retirados después de comprobarlos.

1. Inicio de sesión como Búsqueda.
2. Creación de `QA27 Fundación Esperanza`, alias `QA27FE`, país Bolivia.
3. Creación de `QA27 María Fernanda Pérez`.
4. Registro de un vínculo actual con la organización, cargo `Coordinadora QA27` y fuente explícita.
5. Registro del EMAIL `qa27.contacto@example.test` en la organización, con fuente institucional.
6. Cambio a otro usuario, Planificación, e ingreso en la persona de la variante con espacios y mayúsculas.
7. Detección del medio existente y acción explícita **Asociar este contacto**; una fila canónica y dos asociaciones, sin duplicar el EMAIL ni sustituir las fuentes.
8. Apertura de **Buscar en el Directorio** desde el listado.
9. Consulta `fundacion`, recuperando el nombre con acento, alias y país.
10. Apertura de la ficha real de la organización.
11. Consulta `maria perez`, recuperando a María Fernanda pese al nombre intermedio.
12. Apertura de la ficha real de la persona y consulta de su cargo/organización.
13. Consulta del EMAIL con espacios/mayúsculas, obteniendo el correo normalizado.
14. Comprobación de sus dos asociaciones y navegación a las fichas/contexto.
15. Consulta de historial: autor original del vínculo, segundo autor de la asociación, fechas y fuentes preservadas.
16. Comprobación de información pendiente de verificación: no se inventó verificación al crear, editar, buscar o consolidar. Lectura posterior confirmó cero eventos de verificación en los fixtures.
17. Creación de `QA27 Maria F. Perez`, revisión y consolidación por Administrador hacia María Fernanda; búsqueda del nombre exacto histórico muestra **Ficha histórica consolidada** y enlace al principal. Auditoría conserva actor y ambas identidades.
18. Inactivación explícita de la organización por Administrador: desaparece de los resultados ordinarios de nombres y reaparece con la opción de antecedentes, rotulada **Inactiva**. El correo sigue mostrando su asociación y estado.
19. Búsqueda real con Administrador, Directorio, Búsqueda y Planificación.
20. Planificación y Directorio no pueden modificar configuración de verificación; Planificación no presenta controles de consolidación. Administrador completa la revisión con las confirmaciones exigidas. Las suites HTTP reconfirman 403 de operaciones administrativas para los otros roles.
21. Vista de aproximadamente 390 px: viewport 390 × 844, ancho de documento 375 px, sin desbordamiento horizontal; comprobadas tarjetas de correo, consolidados, principal e inactivos.

Lectura posterior verificó una fila canónica de EMAIL, dos asociaciones con sus fuentes, un vínculo, referencias de consolidación y cuatro eventos auditados con sus autores. La limpieza usó un manifiesto de UUID exactos y una transacción respetando referencias; no usó reset ni truncado. Se compararon IDs/conteos de 13 tablas antes/después y se restauró el baseline completo, sin eliminar datos ajenos. Las capturas de aceptación se conservan fuera de Git. La aplicación queda abierta en login con los tres servicios saludables.

## Correo

**Reutilización demostrada con dos usuarios.** La variante `  QA27.CONTACTO@EXAMPLE.TEST  ` detectó el mismo EMAIL y permitió asociarlo a la persona. Se conservó la asociación original de la organización y su fuente; la nueva asociación preservó su propio autor y fuente. La búsqueda exacta devuelve un único medio con ambos contextos y enlace al detalle. Los tests incluyen EMAIL no utilizable, asociaciones inactivas y conservación de puntos/`+`.

## Organizaciones

`fundacion` encontró `QA27 Fundación Esperanza` y abrió su ficha; se conservaron alias y país. PostgreSQL/HTTP reconfirma alias, prefijos, acentos, matriz/oficina, paginación estable y contexto público sin campos privados.

## Personas

`maria perez` encontró `QA27 María Fernanda Pérez`, mostró su cargo y organización y abrió su ficha. Los tests cubren nombre visible, nombres/apellidos, tokens separados y resumen acotado de vínculos vigentes.

## Consolidación

El Administrador revisó y consolidó la ficha secundaria; el nombre exacto histórico permite orientarse hacia la principal sin esconder la identidad anterior. Se preservan historial, auditoría y referencias. No hay fusión automática ni nuevos permisos; la búsqueda no ejecuta reconciliaciones.

## Registros inactivos

La organización inactiva se excluye por defecto de nombres y reaparece mediante la opción explícita. El resultado indica su estado; el correo no oculta asociaciones solo por inactividad. Los tests también cubren personas inactivas y asociaciones terminadas.

## RBAC

Los cuatro roles oficiales conservan `directory.read` y buscaron en la UI. HTTP reconfirma 401 sin sesión, 403 sin esa capability y acceso de los cuatro roles. Configuración y consolidación mantienen los permisos administrativos anteriores; no se amplió ninguna matriz de autorización.

## Bundle

| Variante | JS inicial minificado | Gzip |
| --- | ---: | ---: |
| Baseline 2.6 | 538,69 kB | 155,79 kB |
| 2.7 con ruta diferida | 541,50 kB | 156,67 kB |
| Comparación 2.7 con carga inmediata | 549,07 kB | 158,30 kB |
| Chunk diferido de búsqueda | 8,04 kB | 2,62 kB |

CSS: 13,69 kB / 3,59 kB gzip. Se aplicó `React.lazy`/`Suspense` únicamente a la ruta nueva, con un cambio pequeño y sin refactor del router existente. Comparada con la misma funcionalidad en carga inmediata, evita **7,57 kB minificados / 1,63 kB gzip** en la entrada. La comparación se hizo en QA aislado y se restauró el routing; el build final utiliza la ruta diferida. El incremento inicial frente a 2.6 es 2,81 kB / 0,88 kB gzip. Se mantiene el warning de Vite de 500 kB, sin cambiar thresholds.

## Argon2/Windows

Se mantuvo la estrategia anterior frente al bloqueo nativo conocido de Argon2 en Windows: lint, tipos, build y los 244 tests frontend pasan en el host; `yarn test` completo y las 626 pruebas PostgreSQL/HTTP pasan en Docker Linux con el código del proyecto y su lockfile. No se debilita Argon2 ni se modifica Control de aplicaciones. No se atribuye a Windows una ejecución completa de API que no se realizó allí.

## Validaciones

| Comando / comprobación | Resultado y entorno |
| --- | --- |
| `yarn lint` | PASS, Windows |
| `yarn typecheck` | PASS, Windows |
| `yarn test` | PASS, Docker Linux, `NODE_ENV=test`: 373 API + 244 frontend |
| `yarn workspace @cecasem-conecta/web test` | PASS adicional en Windows: 244 |
| `yarn build` | PASS, Windows: API y web |
| `yarn workspace @cecasem-conecta/api prisma:generate` | PASS, ejecutado también por las validaciones raíz |
| `yarn workspace @cecasem-conecta/api prisma:validate` | PASS, Windows |
| `yarn workspace @cecasem-conecta/api prisma:migrate:status` | PASS, QA Linux: 17 migraciones aplicadas |
| `yarn workspace @cecasem-conecta/api test:integration` | PASS, Docker Linux, PostgreSQL aislado: 626 |
| Validadores históricos de migraciones 2.1–2.6 | PASS, creación limpia y upgrade con preservación |
| Docker build API/web | PASS |
| `docker compose up -d --wait` | PASS, API/web/db saludables |
| Prisma migrate deploy y status en runtime | PASS, 17 migraciones, sin pendientes |
| Health a través del servicio web | PASS |
| Recorrido manual y responsive | PASS, 21 puntos |
| `git diff --check`, revisión de archivos nuevos y secretos | PASS; sin runtime ni credenciales en cambios |

Validadores ejecutados mediante `node infra/development/validate-directory-migrations.cjs --phase=2.x` para los seis selectores históricos:

| Selector | Migraciones destino | Upgrade preservado |
| --- | ---: | --- |
| 2.1 | 8 | 6 → 8; 7 tablas |
| 2.2 | 10 | 8 → 10; 11 tablas |
| 2.3 | 12 | 10 → 12; 13 tablas |
| 2.4 | 13 | 12 → 13; 16 tablas |
| 2.5 | 15 | 13 → 15; 16 tablas |
| 2.6 | 17 | 15 → 17; 18 tablas |

Cada selector también aprobó instalación desde cero. No se necesita un selector 2.7 ni un upgrade nuevo porque no existe una migración adicional. El despliegue real confirma el estado actual sin SQL pendiente.

## Regresiones

Ninguna detectada por las suites completas ni por el recorrido. Permanecen aprobadas autenticación, sesiones, roles, organizaciones, personas/vínculos, contactos/reutilización, historial, verificación y duplicados. No se alteraron pruebas anteriores para reducir garantías.

Incidencias de ejecución resueltas: la generación simultánea de Prisma se corrigió secuenciando comprobaciones; QA se ejecutó con `NODE_ENV=test`; un fallo de exportación de caché Docker se resolvió reconstruyendo el target afectado sin caché. No se cambió infraestructura, seguridad, lockfile ni se hizo limpieza global de Docker.

## Pendientes

Sin pendientes funcionales de 2.7. Los límites de búsqueda parcial lineal y proyecciones acotadas, el warning de bundle y la restricción del host Argon2 están documentados con sus evidencias. La revisión global de Fase 2 corresponde a un paso posterior solicitado por el usuario.

## PREPARACIÓN PARA CIERRE DE FASE 2

### P0

Directorio P0 demostrable: dos usuarios pueden registrar organización, persona, vínculo y contacto, reutilizar el mismo EMAIL, consultar por nombre/correo, abrir fichas y continuar leyendo historial con autores y fuentes preservados. El recorrido base funcionó antes de consolidar y sin ningún evento de verificación; no depende de las mejoras P1.

### P1

Verificación explícita, revisión derivada y configuración de 2.5 mantienen sus pruebas; detección/revisión/consolidación de 2.6 conserva las suyas. El recorrido real confirmó restricciones administrativas y orientación de la búsqueda hacia una ficha principal; la consulta integra estados inactivos/históricos sin inventar verificación ni consolidar por su cuenta.

### RF

- **RF-09–RF-18:** consulta integrada de las organizaciones, personas, vínculos y medios implementados en las subfases anteriores, con navegación, contexto y permisos. Se reconfirmaron por suites previas y recorrido real, sin redefinir los requisitos documentados.
- **RF-19–RF-22:** comportamiento de verificación/revisión de 2.5 conservado y sus pruebas aprobadas; creación/edición/búsqueda no equivalen a verificar, y configuración sigue restringida.
- **RF-23:** historial consultado entre usuarios, con autor, fecha, fuente y antecedentes preservados, incluyendo consolidación.
- **RF-26:** detección y reutilización exacta del EMAIL demostradas con dos usuarios y dos asociaciones sobre una fila canónica.
- **RF-27/RF-28:** sin regresiones en duplicados; revisión humana administrativa, consolidación auditada y ficha histórica enlazada al principal.
- **Preparación RF-24:** fichas, identidad canónica, contexto institucional e historial permiten continuidad entre usuarios. Los procesos y sus eventos/comunicaciones siguen fuera de esta implementación; no se declara RF-24 completo.

### Migraciones

17 migraciones versionadas intactas, selectores históricos 2.1–2.6 aprobados, instalación 0 → 17 y upgrade 15 → 17 con datos preservados, runtime sin pendientes. No se modificaron roles de PostgreSQL ni extensiones.

### Pruebas

1243 pruebas aprobadas: 373 API, 244 frontend y 626 PostgreSQL/HTTP. 67 nuevas respecto de 2.6, más el recorrido de aceptación de 21 puntos.

### Docker

API y web construidos y desplegados; API/web/db saludables y health operativo. Datos/credenciales QA retirados, baseline restaurado y aplicación abierta. Contenedor auxiliar y archivos temporales propios retirados; servicios de la aplicación conservados.

### Warnings no bloqueantes

Vite sigue advirtiendo un chunk inicial mayor a 500 kB. El bloqueo conocido de Argon2 en Windows se cubre con ejecución completa Linux sin reducir seguridad. Jest emite el aviso de módulos VM experimentales y `pg` la deprecación de consultas concurrentes de cara a pg 9; las suites pasan. No se actualizaron dependencias para silenciar avisos.

### Fuera de alcance

Sin procesos, intenciones, participantes, comunicaciones, notas, restricciones de no contacto, oportunidades, reuniones, archivos, notificaciones, dashboard general, importación/exportación, traducción, integración Gmail/Zoho ni VPS. Sin motor externo de búsqueda, paquetes compartidos prematuros o nuevas dependencias. No se actualizó Notion, no se inició Fase 3 y no se declara Fase 2 cerrada.

## Estado Git

HEAD permanece `546fd6eea4d58f1bca15dbd8d15305c68e6e0026`. **4 archivos modificados y 13 nuevos, 17 en total**, únicamente implementación, pruebas e informe de 2.7. Diff y contenido nuevo revisados; sin staging, commit de 2.7 ni push. Sin `.env`, contraseñas reales, tokens, uploads, datos de base, backups o capturas en Git. `package.json`, `yarn.lock`, Prisma, migraciones e infraestructura permanecen intactos.

Listado exacto (M = modificado, A = nuevo):

- M `apps/api/src/app.module.ts`
- M `apps/api/src/modules/directory/directory.module.ts`
- M `apps/web/src/app/router/app-routes.tsx`
- M `apps/web/src/features/directory/organizations-page.tsx`
- A `apps/api/src/modules/directory/directory-search.contract.ts`
- A `apps/api/src/modules/directory/directory-search.rules.ts`
- A `apps/api/src/modules/directory/directory-search.service.ts`
- A `apps/api/src/modules/search/search.controller.ts`
- A `apps/api/src/modules/search/search.dto.ts`
- A `apps/api/src/modules/search/search.module.ts`
- A `apps/api/src/modules/search/search.service.ts`
- A `apps/api/src/modules/search/search.spec.ts`
- A `apps/api/test/search.integration-spec.ts`
- A `apps/web/src/features/directory/search-page.tsx`
- A `apps/web/src/features/directory/search.contracts.ts`
- A `apps/web/src/features/directory/search.test.tsx`
- A `docs/subfase-2.7-busqueda.md`
