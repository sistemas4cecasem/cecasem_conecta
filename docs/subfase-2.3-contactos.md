# SUBFASE 2.3 — RESULTADO FINAL

## Estado

SUBFASE 2.3 COMPLETADA. Medios de contacto, asociaciones, API, interfaz,
permisos, historial e integración implementados. No se inició 2.4.

## Baseline

Rama `main`, HEAD inicial `537414e8b2c25e7bf156889baeeb642402bde78b`,
working tree limpio y diez migraciones. El commit previo de 2.2 fue autorizado
por el usuario. Después de implementar 2.3, el usuario autorizó expresamente
un commit local convencional en español; esa autorización sustituye la
restricción inicial de no hacer commit. No se autorizó ni realizó push.

## Implementado

Se extiende `directory` con seis tipos de medio: EMAIL, PHONE, LINKEDIN, FORM,
WEB y OTHER. Las fichas de organizaciones y personas incorporan contactos
paginados, alta conjunta, selección de un medio existente, fuente,
observaciones, edición contextual, finalización lógica e historial.
La ficha del medio muestra condición global y actores asociados, incluidos
antecedentes inactivos, corrección global y sustitución explícita por actor.

## Decisiones efectivamente tomadas

- EMAIL reutiliza la política de Fase 1: trim y lowercase. Preserva puntos y
  sufijos `+`; no inventa equivalencias de proveedores. Un índice parcial único
  PostgreSQL protege EMAIL, independientemente del actor, condición global o
  estado de sus asociaciones.
- PHONE conserva la representación introducida después de trim. Admite de
  seis a veinte dígitos, `+` inicial y separadores habituales. No convierte
  países ni impone equivalencias internacionales.
- WEB y FORM admiten URL HTTP/HTTPS sin credenciales embebidas. LINKEDIN exige
  además host linkedin.com o un subdominio suyo. No hay scraping ni
  sincronización con el sitio oficial de una organización.
- OTHER exige una etiqueta descriptiva. Los tipos distintos de EMAIL no
  reciben normalización canónica ni unicidad global automática.
- `USABLE`/`UNUSABLE` describe disponibilidad reportada del canal, nunca
  verificación. Cada asociación tiene `isActive` independiente y conserva
  fuente, URL y observaciones propias. `lastVerifiedAt` permanece null;
  creación, corrección y finalización no verifican.
- Una corrección conserva la identidad del medio. Si tiene más de una
  asociación, incluidas las históricas, requiere revisión de actores afectados,
  `confirmShared` y `expectedVersion`. El tipo no puede cambiarse.
- Corregir A hacia un EMAIL de B devuelve `CONTACT_VALUE_EXISTS` con el ID
  público de B. La interfaz permite sustituir una asociación seleccionada:
  asocia B y finaliza A en una transacción, conserva A y las demás asociaciones,
  y no fusiona actores. Si B ya estaba asociado, conserva su contexto;
  una asociación destino inactiva requiere reactivación administrativa explícita.
- Repetir actor + medio responde 200 con `outcome: existing`, preserva fuente,
  estado y versión, y no añade historial. Una asociación nueva responde
  `outcome: created`; nunca se reactiva implícitamente una asociación anterior.

## Modelo final

`ContactMethod` representa el canal canónico. `PersonContact` conecta mediante
FK una persona y el medio; `OrganizationContact` conecta una organización y
el medio. Cada par tiene constraint única, incluso cuando queda inactivo.
FK restrictivas conservan las referencias históricas. No hay ownerType/ownerId
polimórfico ni campos email/phone como fuente principal de fichas.

## Concurrencia e historial

La consulta previa de EMAIL usa debounce de 350 ms y cancelación de consultas
obsoletas. Al guardar, `INSERT … ON CONFLICT` sobre el índice parcial distingue
creación de colisión y devuelve `CONTACT_EMAIL_EXISTS` con el medio existente.
El conflicto revierte la operación; no crea una asociación sin confirmación.
La UI conserva fuente y observaciones y ofrece abrir ficha, cancelar o reutilizar.

Reutilizar exige `expectedMethodVersion`. Crear una asociación incrementa la
versión del medio para que una corrección global no ignore nuevos actores.
Las escrituras bloquean medio antes de asociación; sustituciones bloquean los
dos medios en orden de UUID. Las ediciones usan la versión capturada al abrir
el formulario, conservan el borrador ante 409 y requieren recarga explícita.

Se reutiliza `DirectoryChange` y la auditoría existente con objetivos concretos
y FK. Creación, fuente, observación, condición, corrección y finalización quedan
en la misma transacción que sus cambios. Un no-op no fabrica eventos.
Una sustitución usa dos UUID de operación para crear/finalizar dentro de una
sola transacción, conservando la unicidad existente de operación + campo.

## API y RBAC

Base `/api/v1`, sesión obligatoria, DTO estrictos, UUID, proyecciones públicas y
GET con `Cache-Control: no-store`. No se exponen normalizedValue, _count ni
campos internos de usuarios. Son 27 endpoints:

| Método y ruta | Comportamiento |
| --- | --- |
| GET /contact-methods | Medios paginados, filtro type opcional |
| POST /contact-methods | Crear exclusivamente el medio, 201 |
| GET /contact-methods/email?email=… | Consulta exacta, `{contact: medio o null}` |
| GET /contact-methods/:id | Ficha y cantidad total de asociaciones |
| PUT /contact-methods/:id | Corrección con versión y confirmación compartida |
| PATCH /contact-methods/:id/condition | Condición global administrativa |
| GET /contact-methods/:id/history | Historial del medio |
| GET /contact-methods/:id/people | Asociaciones a personas paginadas |
| GET /contact-methods/:id/organizations | Asociaciones a organizaciones paginadas |
| GET /people/:id/contacts; GET /organizations/:id/contacts | Contactos del actor |
| POST /people/:id/contacts; POST /organizations/:id/contacts | Crear medio y asociación atómicamente, 201 |
| POST /people/:id/contacts/existing; POST /organizations/:id/contacts/existing | Reutilización explícita, 200 |
| GET /person-contacts/:id; GET /organization-contacts/:id | Asociación concreta |
| PUT /person-contacts/:id; PUT /organization-contacts/:id | Contexto con versión |
| PATCH /person-contacts/:id/end; PATCH /organization-contacts/:id/end | Finalización lógica ordinaria |
| PATCH /person-contacts/:id/status; PATCH /organization-contacts/:id/status | Estado administrativo y reactivación |
| POST /person-contacts/:id/replace; POST /organization-contacts/:id/replace | Sustitución confirmada con versiones, 200 |
| GET /person-contacts/:id/history; GET /organization-contacts/:id/history | Historial contextual |

Página inicial 1, tamaño 25, máximo 100; orden createdAt desc + id desc.
Asociaciones a personas y organizaciones se paginan por separado. PUT reemplaza
campos editables; opcionales omitidos se vacían. Crear solamente el medio es
explícitamente distinto del alta conjunta, que revierte también el medio si falla.

Los cuatro roles reutilizan directory.read, directory.write y
directory.history.read para operaciones ordinarias, incluida finalización.
Condición global y reactivación usan directory.status.update, reservada al
Administrador. Los servicios revalidan actor activo y permiso vigente dentro
de la transacción. No se crearon capabilities nuevas.

Conflictos públicos: VERSION_CONFLICT, CONTACT_EMAIL_EXISTS,
CONTACT_VALUE_EXISTS, SHARED_CONTACT_CONFIRMATION_REQUIRED, CONTACT_UNUSABLE
e INVALID_CONTACT_REPLACEMENT. Referencias inexistentes responden 404.
La UI usa códigos estructurados e ID validado, sin interpretar texto humano.

## Migraciones

1. `20261002211000_contact_methods`: enums, modelos, FK e índices.
2. `20261002211100_contact_constraints`: índice EMAIL y CHECK de datos,
   historial y auditoría; usa enums después de confirmar la primera migración.

Las diez migraciones previas permanecen intactas. Aplicación mediante migrate
deploy, sin db push ni reset. El validador existente se amplió:

```text
node infra/development/validate-directory-migrations.cjs
```

Requiere DATABASE_URL local terminada en _test. Instalación limpia 0→12: OK.
Upgrade 10→12: OK, preservadas trece tablas anteriores, incluyendo personas,
episodios históricos/vigentes, sesiones, tokens, auditoría, matriz/sede,
categorías y cambios de fichas. Elimina únicamente sus bases y staging de QA.
`--phase=2.2` conserva y pasó la comprobación histórica 0→10 y 8→10 con once
tablas preservadas; `--phase=2.1` mantiene el recorrido histórico 6→8.

## Pruebas

| Suite completa | Resultado |
| --- | --- |
| API unitarias/E2E sin PostgreSQL | 293 aprobadas |
| Frontend | 150 aprobadas |
| PostgreSQL real / HTTP | 466 aprobadas |
| Total | 909 aprobadas |

2.3 añade 32 pruebas API, 22 frontend y 89 PostgreSQL/HTTP. Cubren tipos,
normalización, permisos, idempotencia, contexto independiente, confirmación
compartida, versiones, sustitución, unicidad, FK, constraints, rollback de
historial/auditoría y carreras deterministas. La paginación dentro del formulario
usa botones type=button; una regresión comprueba que paginar no envía el alta.

## Validaciones

yarn lint, yarn typecheck, yarn test, yarn build, prisma:generate,
prisma:validate, prisma:migrate:status y test:integration: OK.
Docker build API/web y contenedor de migraciones: OK. Ambas migraciones
aplicadas al runtime local; docker compose up -d --wait: OK, tres servicios
saludables y health HTTP 200. git diff --check: OK.

Vite informa una advertencia no bloqueante: JavaScript de 511,39 kB minificado,
150,33 kB gzip, por encima del umbral de 500 kB. El build termina correctamente.
No se alteró configuración del bundler para ocultarla ni se añadieron dependencias.

## Aceptación funcional y escenario crítico del correo

Recorrido real contra Docker local con cuenta Administrador temporal y actores
de QA creados desde la interfaz: login, organización, alta de
`contacto@fundacion.org` con fuente Sitio oficial, persona e intento de
` CONTACTO@FUNDACION.ORG `. La interfaz detectó el mismo medio, mostró la
organización y permitió asociación explícita conservando fuente Recomendación.

Se editó solo el contexto personal, se consultó historial con antes/después y
autor, y se finalizó esa asociación con confirmación. Resultado verificado en
interfaz y PostgreSQL: un medio canónico, dos asociaciones con FK, persona
inactiva como antecedente y organización activa; fuente institucional intacta,
fuente personal actualizada y lastVerifiedAt null en ambas.

Responsive: clientWidth y scrollWidth de 390 px, sin desbordamiento horizontal;
evidencia visual guardada fuera del repositorio. Después se cerró sesión, se
restauró el viewport y se eliminaron fixtures por sus UUID y credenciales
temporales. La base local volvió al baseline vacío.

Concurrencia automatizada determinista: dos creaciones del mismo EMAIL dejan
un medio, una respuesta 201 y otra 409 CONTACT_EMAIL_EXISTS recuperable;
después la reutilización confirmada conserva ambas asociaciones. Dos intentos
del mismo par dejan una asociación y un único historial de creación, con
outcomes created/existing. Correcciones simultáneas protegen expectedVersion.

## Regresiones y pendientes

Ninguna regresión conocida; pasan todas las suites previas. No quedan pendientes
funcionales o validaciones de 2.3. La advertencia de tamaño de Vite está registrada.

## Fuera de alcance respetado

No se implementaron verificación, intervalos, settings, duplicados por similitud,
consolidación de actores, búsqueda global, procesos, comunicaciones, archivos,
importación/exportación ni envío de correo. No se actualizó Notion.

## Estado Git

Cambios limitados a 2.3: modelo y dos migraciones, directory y auditoría,
interfaz, pruebas/regresiones, validador y documentación. Se revisaron el diff
y la inclusión de archivos; sin secretos, archivos runtime ni nuevas dependencias.
Commit local convencional autorizado posteriormente por el usuario; sin push.

Listado exacto del cierre: 18 modificados y 19 nuevos.

```text
A	apps/api/prisma/migrations/20261002211000_contact_methods/migration.sql
A	apps/api/prisma/migrations/20261002211100_contact_constraints/migration.sql
M	apps/api/prisma/schema.prisma
M	apps/api/src/modules/audit/audit.service.ts
A	apps/api/src/modules/directory/contacts.controller.ts
A	apps/api/src/modules/directory/contacts.dto.ts
A	apps/api/src/modules/directory/contacts.rules.spec.ts
A	apps/api/src/modules/directory/contacts.rules.ts
A	apps/api/src/modules/directory/contacts.service.spec.ts
A	apps/api/src/modules/directory/contacts.service.ts
M	apps/api/src/modules/directory/directory-error.filter.ts
M	apps/api/src/modules/directory/directory-history.service.ts
M	apps/api/src/modules/directory/directory.errors.ts
M	apps/api/src/modules/directory/directory.module.ts
A	apps/api/test/contacts.integration-spec.ts
M	apps/api/test/password-reset.integration-spec.ts
M	apps/api/test/users-administration.integration-spec.ts
M	apps/web/src/app/router/app-routes.tsx
A	apps/web/src/features/directory/contact-associations.tsx
A	apps/web/src/features/directory/contact-context-form.tsx
A	apps/web/src/features/directory/contact-context.ts
A	apps/web/src/features/directory/contact-create-form.tsx
A	apps/web/src/features/directory/contact-detail-page.tsx
A	apps/web/src/features/directory/contact-section.tsx
A	apps/web/src/features/directory/contacts.contracts.ts
A	apps/web/src/features/directory/contacts.queries.ts
A	apps/web/src/features/directory/contacts.test.tsx
M	apps/web/src/features/directory/directory-ui.tsx
M	apps/web/src/features/directory/directory.test.tsx
M	apps/web/src/features/directory/organization-detail-page.tsx
M	apps/web/src/features/directory/organization-history.tsx
M	apps/web/src/features/directory/people.test.tsx
M	apps/web/src/features/directory/person-detail-page.tsx
M	apps/web/src/lib/api/client.ts
M	docs/subfase-2.2-personas.md
A	docs/subfase-2.3-contactos.md
M	infra/development/validate-directory-migrations.cjs
```
