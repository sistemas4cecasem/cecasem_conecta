# SUBFASE 2.4 — Historial de fichas

## Estado y baseline

SUBFASE 2.4 COMPLETADA. Rama `main`, HEAD inicial
`7b21cf776776707377ad5cc169d92ba4cd94f915`, working tree inicialmente limpio,
12 migraciones y 909 pruebas al cierre de 2.3. Commit local de 2.4 autorizado
posteriormente por el usuario; sin push.

## Estado encontrado y correcciones

`DirectoryChange` ya persistía campos anteriores/nuevos, FK de autor, fecha y
operationId en las mismas transacciones que las mutaciones. Los siete tipos
tenían rutas GET protegidas; la autoría y el acceso a objetos inactivos ya
conservaban sus referencias. Se reutiliza ese sistema, separado de AuditEvent.

Los gaps eran paginar filas individuales y resolver referencias con nombres
actuales, lo que podía partir una operación y reinterpretar el pasado. También
faltaba registrar relaciones iniciales de organización y altas de episodios
persona–organización. Una sustitución utilizaba operaciones distintas para alta
de asociación y finalización de la anterior.

Ahora se pagina por operación completa, se guardan etiquetas mínimas al escribir,
se registran esas altas y se correlaciona una sustitución con un operationId común.
La reutilización de una asociación destino existente no fabrica nuevas entradas
para ella. Su historial original y su contexto permanecen intactos.

## Modelo y migración

La migración `20261002230000_history_reference_snapshots` es la número 13.
Añade únicamente `DirectoryChange.referenceSnapshot`, JSONB nullable, y valida
su forma básica. Conserva los CHECK anteriores y admite `relationCreated` para
el alta de un vínculo. No cambia AuditEvent, roles, FK ni estructuras de fases
posteriores. No edita migraciones aplicadas.

previousValue y newValue siguen siendo los valores originales tipados
(string, boolean, string[] o null). El snapshot contiene referencias mínimas
`{id, kind, label}` anteriores/nuevas, contexto del vínculo/asociación y, cuando
corresponde, el par de canales de una sustitución. Se escribe dentro de la misma
transacción y nunca se actualiza al renombrar los objetos referidos.

No hay backfill: las entradas previas mantienen referenceSnapshot SQL NULL.
Su contrato conserva IDs y valores; las etiquetas ausentes son null y la UI
explica que no fueron registradas. No consulta nombres actuales para presentarlos
como históricos ni inventa cambios de creación para fichas antiguas.

La FK de autor sigue resolviendo id, givenNames, familyNames e isActive. La
administración actual no permite renombrar usuarios: no hace falta duplicar su
identidad en snapshots. La desactivación conserva la fila y no participa como
filtro de historial. isActive se presenta explícitamente como estado actual del
autor. Si una fase futura autoriza renombrar identidades, deberá revisar esa
decisión antes de introducir dicha mutación.

## Contrato y paginación

Se mantienen las siete rutas `GET /api/v1/{tipo}/:id/history`:
organizations, categories, people, person-organization-relations, contact-methods,
person-contacts y organization-contacts. Requieren sesión y
`directory.history.read`; UUID inválido da 400, objeto ausente 404 y consulta
inválida 400. El estado lógico no impide consultar el objeto.

Respuesta: `{items, total, page, pageSize}`. Cada item es una operación con
operationId, createdAt, objectType, proyección pública de actor,
contextRecorded, relatedReferences, replacement nullable y changes. Cada cambio
incluye field, etiqueta funcional label, previousValue/newValue,
previousReferences/newReferences y referencias added/removed.

La unidad de total y pageSize es **operaciones**, no campos. Page inicial 1,
pageSize 25, máximo 100, según PageQueryDto existente. PostgreSQL selecciona
operationId agrupados y cuenta operaciones distintas. Orden descendente por
MIN(createdAt), con operationId descendente como desempate. Se recuperan todos
los campos únicamente de las operaciones seleccionadas, ordenados por field/id,
en una transacción RepeatableRead. El contrato no expone referenceSnapshot bruto,
columnas privadas de User ni IDs individuales de DirectoryChange.

Se conserva la paginación por página del Directorio; no se añade una segunda
convención ni una optimización de infraestructura sin evidencia de necesidad.

## Frontend, caché y RBAC

DirectoryHistory sustituye OrganizationHistory y se reutiliza en las fichas y
paneles de los siete tipos. Muestra tipo, operación, número de cambios, una fecha
y un autor, antes/después, categorías añadidas/retiradas y contexto histórico.
Sin dato, vigencia, estados y condición del medio tienen etiquetas explícitas;
los UUID no se muestran como sustituto de nombres. La sustitución muestra los
canales anterior/nuevo y se distingue de una finalización ordinaria.

Se mantienen las query keys e invalidaciones del Directorio, TanStack Query,
limpieza al perder sesión/cambiar identidad, loading/error/retry/empty y controles
de paginación. No se crean endpoints para modificar o borrar historial.

Los cuatro roles mantienen directory.history.read. No se añade ninguna capability
ni se amplía users.read: Búsqueda y Planificación identifican autores desde la
proyección del historial aunque `/users` les responda 403. Directorio conserva
su permiso users.read preexistente, sin ampliación.

## Pruebas y validaciones

Conteos reales finales: **304 API + 166 frontend + 508 PostgreSQL/HTTP = 978**,
69 pruebas nuevas respecto de 2.3. Todas aprobadas. Regresiones nuevas: operaciones
completas y desempate; null/boolean/referencias; snapshots tras renombrados;
altas; sustitución con destino nuevo/existente; no-op; rollback de ficha e historial
si falla historial o auditoría; FK y autor desactivado; los siete tipos inactivos;
401/403/400/404 y lectura por cuatro roles; UI, paginación, retry, invalidación,
logout y revocación de capability. No hay regresiones conocidas.

Ejecutados y aprobados: `yarn lint`, `yarn typecheck`, `yarn test`, `yarn build`,
`yarn workspace @cecasem-conecta/api test:integration`, Prisma generate/validate y
migrate status. Integración y validadores usan DATABASE_URL local terminada en
`_test`, nunca resetean la base de la aplicación.

`node infra/development/validate-directory-migrations.cjs --phase=2.4` valida limpia con 13
migraciones y upgrade 12→13 con 16 tablas preservadas, incluidos contactos,
sesiones, auditoría e historial previo; comprueba que los snapshots legacy
continúan NULL. También pasan los modos históricos `--phase=2.1` (6→8, 7 tablas),
`--phase=2.2` (8→10, 11 tablas) y `--phase=2.3` (10→12, 13 tablas). Se elimina solo
su staging y sus bases temporales. La documentación de 2.3 usa ahora su selector
explícito para que el comando siga validando aquella subfase.

Docker build aprobado. Migrate deploy aplicado a la base local conservando su
contenido; migrate status confirma 13 aplicadas. `docker compose up -d --wait`
deja db/api/web healthy; `/api/v1/health` devuelve 200 y un GET de historial
anónimo 401. Los servicios quedan ejecutándose.

## RF-23, preparación RF-24 y aceptación real

Se ejecutó el recorrido con dos cuentas temporales: Autora QA (Búsqueda) y Lectura
QA (Administrador). La autora creó una organización, editó país y descripción
en una sola operación, asignó una categoría, creó persona y episodio con cargo,
corrigió Coordinadora→Directora y registró un contacto cuya fuente luego editó.
Los paneles mostraron valores anteriores/nuevos, fecha, autora, etiquetas de
referencias y contexto; las altas y correcciones quedaron diferenciadas.

El administrador desactivó a la autora mediante la interfaz de usuarios, consultó
la organización y siguió identificándola en las operaciones con la indicación
Usuario actualmente desactivado. Desactivó la organización y comprobó que las
operaciones, categoría y vínculo seguían disponibles. PostgreSQL confirmó la
operación compartida para país/descripción, snapshots y estado de autora.
La prueba HTTP adicional comprueba lo mismo con un lector sin users.read y la
invalidación de la sesión de la autora. No se la reactiva ni se avanza a Fase 3.

Responsive: clientWidth y scrollWidth de **390 px**, sin desbordamiento horizontal.
Capturas guardadas fuera del repositorio. Se cerró sesión, se restauró el viewport,
se eliminaron exclusivamente fixtures por UUID comprobados y se retiró el archivo
temporal de credenciales. La base local volvió a sus conteos iniciales vacíos.

## Bundle, pendientes y alcance

JavaScript minificado: **508,56 kB**, gzip **149,82 kB**, frente a 511,39 kB al
cierre de 2.3. Sigue el warning no bloqueante de Vite por superar 500 kB; no se
oculta ni se cambia configuración ni se introduce code splitting sin necesidad.

No quedan pendientes de 2.4. Se respetan los límites: no verificaciones, fases
posteriores, comunicaciones, historial retrospectivo, Event Sourcing ni Notion.
Sin dependencias nuevas, secretos o runtime en los cambios. Working tree listo
revisado. Commit local convencional autorizado por el usuario; sin push.
