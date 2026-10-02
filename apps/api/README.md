# CECASEM Conecta API

Backend base de las subfases 0.2 y 0.4: NestJS, PostgreSQL y Prisma ORM 7.10.0.
Incorpora el modelo de identidades de Subfase 1.1. No incluye autenticación ni seeds.

## Ejecución

Usar Node.js 24.21.0 (`.nvmrc` raíz) y Yarn 4.18.1. Desde la raíz:

```sh
yarn install --immutable
yarn dev
```

Antes de iniciar, debe existir PostgreSQL accesible y `DATABASE_URL` configurada.
`yarn dev` inicia API y Web mediante sus workspaces; API genera Prisma Client
antes de arrancar en modo watch.
Para construir y ejecutar el resultado de producción, desde la raíz:

```sh
yarn build
yarn workspace @cecasem-conecta/api start:prod
```

`start:prod` establece `NODE_ENV=production` y ejecuta `dist/main.js`.

## Configuración y rutas

Nest carga `apps/api/.env` cuando los comandos se ejecutan mediante el workspace.
Las variables del proceso prevalecen sobre ese archivo. Si se necesita un archivo
local, usar `.env.example` como referencia; el `.env` real no debe versionarse.

| Variable | Valor por defecto | Valores aceptados |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, `production` |
| `APP_PORT` | `3000` | Entero entre `1` y `65535` |
| `DATABASE_URL` | Sin valor por defecto | URL `postgresql://` o `postgres://` con host y nombre de base de datos |

Una configuración inválida impide el arranque; no se sustituye silenciosamente
por el valor por defecto.

- `GET /api/v1/health`: ejecuta `SELECT 1` mediante Prisma y devuelve
  `{"status":"ok","database":"ok"}`. Si PostgreSQL deja de estar disponible,
  devuelve HTTP 503 con el formato uniforme de error y sin detalles de conexión.
- `/api/docs/`: Swagger UI, únicamente con `NODE_ENV=development`.
- `/api/docs-json`: documento OpenAPI en desarrollo.

Los errores usan `statusCode`, `message`, `path` y `timestamp`. Los errores de
validación conservan su lista de mensajes; los fallos internos se registran sin
su contenido sensible y devuelven un mensaje genérico al cliente.

## PostgreSQL y Prisma

Se validó contra PostgreSQL 18.6. Utiliza una instancia PostgreSQL soportada,
una base existente y una cuenta de aplicación sin privilegios de superusuario.
El ejemplo de `.env.example` es un placeholder local; no crea usuarios ni bases.
Puedes proporcionar `DATABASE_URL` mediante variables del proceso, sin crear
un `.env` real. Los caracteres especiales de las credenciales deben codificarse
para URL. No imprimas la URL completa ni compartas logs que contengan contraseñas.

`prisma/schema.prisma` utiliza el generador moderno `prisma-client` y datasource
PostgreSQL. `prisma.config.ts` define schema, migraciones y URL; carga un `.env`
local mediante `loadEnvFile` de Node si existe, respetando el entorno del proceso.
La URL puede faltar para generar/validar el schema, que no necesita conexión.
Para iniciar API o ejecutar migraciones es obligatoria; una URL inválida falla
con un mensaje que no reproduce las credenciales.

El cliente se genera en `src/generated/prisma`, está ignorado por Git y no se
edita manualmente. `dev`, `start`, `build`, `lint`, `typecheck` y los scripts de
pruebas lo generan explícitamente. No se necesita una base accesible para generar
o compilar. `start:prod` utiliza el cliente ya compilado dentro de `dist`.

El generador utiliza `moduleFormat = "cjs"` para ajustarse al formato de salida
actual de NestJS (`NodeNext`, sin cambiar el manifest a ESM). Las dependencias ESM
continúan cargándose con Node 24. Jest resuelve los imports `.js` del cliente
generado hacia las fuentes TypeScript durante las pruebas.

`DatabaseModule` exporta una única instancia de `PrismaService`. Usa
`@prisma/adapter-pg` 7.10.0 y `pg` 8.23.0 con un pool central, timeout de conexión
y consulta de cinco segundos y cierre mediante los hooks de NestJS. La conexión
real se verifica al iniciar mediante una consulta; un fallo aborta el arranque
con un mensaje seguro y libera el pool. Después del arranque, health permite
detectar caídas y recuperarse cuando PostgreSQL vuelve a estar disponible.

## Migraciones

Desde la raíz:

```sh
yarn workspace @cecasem-conecta/api prisma:generate
yarn workspace @cecasem-conecta/api prisma:validate
yarn workspace @cecasem-conecta/api prisma:migrate:status
yarn workspace @cecasem-conecta/api prisma:migrate:dev --name nombre_del_cambio
yarn workspace @cecasem-conecta/api prisma:migrate:deploy
```

La ubicación configurada es `prisma/migrations`. La primera migración funcional,
`20261001205420_identity_users_roles`, incorpora usuarios, el enum de roles,
cuentas de correo y su asociación explícita. Las migraciones deben versionarse.
Nunca se editan después de aplicarlas; los cambios posteriores requieren otra migración.

Antes de aplicar la primera migración, `migrate status` puede indicar que la base aún no está gestionada y
terminar con código 1. `migrate deploy` inicializa el registro estándar interno
`_prisma_migrations`; sin migraciones, informa que no hay pendientes. Después,
`migrate status` devuelve que está al día. Esto no crea un esquema de aplicación
ni sustituye la primera migración real. Los comandos se validaron sobre una base
temporal vacía, sin afectar bases existentes.

`migrate dev` es exclusivamente para desarrollo y necesita permisos para su base
shadow cuando se incorporen modelos. Esos permisos no son un requisito de la
cuenta de ejecución de la API. No uses `db push` como sustituto de migraciones.

## Calidad

Los comandos raíz `yarn lint`, `yarn typecheck`, `yarn test` y `yarn build`
ejecutan verificaciones reales en este workspace. `yarn test` incluye las pruebas
unitarias y e2e sin PostgreSQL (la infraestructura Prisma se sustituye únicamente
en esas pruebas). También se pueden ejecutar `test:unit` o `test:e2e` mediante
`yarn workspace @cecasem-conecta/api`.

Jest utiliza `--experimental-vm-modules` para cargar los paquetes ESM de NestJS 12.
Node puede emitir el aviso correspondiente durante las pruebas; este flag no se
utiliza al iniciar la API. Las pruebas e2e y el runtime comparten la configuración
del prefijo, ValidationPipe, filtro de excepciones y Swagger.

Las pruebas reales de PostgreSQL se ejecutan por separado, con `DATABASE_URL`
apuntando a una base de pruebas accesible:

```sh
yarn workspace @cecasem-conecta/api test:integration
```

Esta suite no sustituye Prisma ni usa un motor simulado: verifica conexión,
consulta parametrizada, health saludable, HTTP 503 durante una interrupción TCP,
recuperación, fallo de arranque y cierre de conexiones. Utiliza un proxy temporal
para interrumpir sus propias conexiones; no detiene una instancia compartida ni
crea registros. Cierra aplicación, pool observador, proxy y sockets al finalizar.
No configura `.env` automáticamente; proporciona la variable en el proceso.

Para validar manualmente: inicia API con PostgreSQL disponible, consulta health,
interrumpe únicamente una instancia temporal de prueba, comprueba 503, restáurala
y comprueba 200. Detén API y la instancia temporal al terminar.

En 0.4 se utilizaron binarios Windows de PostgreSQL publicados por EDB y enlazados
desde la [página oficial](https://www.postgresql.org/download/windows/), en un
directorio temporal fuera del repositorio. No se instaló un servicio permanente
ni se añadieron Dockerfile, Compose o Nginx; Docker Desktop no pudo iniciar en
este equipo. La infraestructura permanente corresponde a 0.5.

Prisma CLI 7.10.0 incluye Studio y emite avisos de peers React internos de ese
paquete. Los comandos de generación, validación y migraciones funcionan; no se
añadieron dependencias de UI al backend para ocultar esos avisos.

## Identidades — Subfase 1.1

`UsersModule`, en `src/modules/users`, exporta `UsersService` como interfaz interna
para crear identidades, buscarlas por correo, crear cuentas disponibles y asociarlas.
En 1.1 no contenía controllers, credenciales, sesiones ni autorización HTTP. Los
módulos consumidores deben importar este módulo, no manipular su persistencia.

### Modelo e invariantes

- `User`: UUID generado por PostgreSQL mediante `gen_random_uuid()`, nombres y
  apellidos compuestos (`givenNames`, `familyNames`), username y email únicos,
  rol obligatorio, estado y fechas. El rol no tiene default.
- `UserRole`: `ADMINISTRATOR` = Administrador, `BOARD` = Directorio,
  `RESEARCH` = Búsqueda y `PLANNING` = Planificación.
- `EmailAccount`: UUID, dirección única, descripción obligatoria, proveedor
  descriptivo opcional, estado y fechas. Nunca contiene credenciales externas.
- `UserEmailAccount`: asociación N↔N explícita con PK compuesta, fecha de creación
  e índice para consultar usuarios de una cuenta. Ambas FK usan RESTRICT en
  DELETE y UPDATE; no hay cascadas destructivas.
- Los instantes son `TIMESTAMPTZ(3)`, representados como `Date` en la aplicación.
  `updatedAt` se actualiza mediante Prisma; no se introducen triggers.

La migración añade CHECK para exigir que un usuario activo tenga fecha de
desactivación null y uno inactivo tenga fecha. Un cambio futuro de estado debe
actualizar ambos campos atómicamente. No hay operación administrativa de estado
en esta subfase. Cambiar el estado no elimina identidades ni asociaciones y no
libera email, username o dirección de buzón.

### Normalización y username

La aplicación valida el correo con `class-validator`, limita a 254 caracteres y
aplica exclusivamente trim y lowercase. Conserva puntos y sufijos `+`. Creación
y búsqueda utilizan la misma función. Dos CHECK rechazan escrituras directas de
emails/direcciones no canónicas, y sus índices únicos protegen la unicidad.
Los CHECK no reemplazan la validación de formato de la aplicación.

Los nombres/descripciones conservan sus caracteres y capitalización; se recortan
y colapsan espacios, con un máximo de 150 caracteres. Para username:

1. NFKD, eliminación de marcas diacríticas y lowercase.
2. Eliminación de apóstrofes rectos y variantes `’`/`ʼ` dentro de componentes.
3. Primer componente alfanumérico ASCII útil; guiones y otros separadores delimitan
   componentes. Entradas sin componente útil se rechazan, sin inventar nombres.
4. Cada componente se limita a 30 caracteres: `nombre.apellido` mide hasta 61.
5. Intentos 1–100: base sin sufijo, después `2`, `3`, …, `100`. Máximo 64 caracteres.

Ejemplos: `Diego Armando` / `Fariñas Ávila` → `diego.farinas`;
`Ana-María` / `Pérez-Gómez` → `ana.perez`;
`D'Artagnan` / `O'Neill` → `dartagnan.oneill`.

Cada intento hace un INSERT independiente. Solo un P2002 del índice de username
permite reintentar: se reconocen campos de `meta.target` o el índice estructurado
de `driverAdapterError.cause.constraint` utilizado por adapter-pg 7.10. No se
analizan mensajes SQL ni se registran datos personales. Un conflicto de email o
un fallo inesperado no inicia esa secuencia. Tras 100 colisiones se devuelve un
conflicto interno explícito. PostgreSQL es la garantía final ante concurrencia.

### Pruebas y migración

Las unitarias cubren normalización, componentes, longitudes, errores y límites de
reintento. `test/users.integration-spec.ts` usa PostgreSQL real y verifica roles,
unicidad, CHECK, concurrencia, cardinalidad, FK y conservación tras cambios de estado.
La suite escribe únicamente fixtures de una base `_test` y limpia sus UUID después
de cada prueba. Las pruebas de conectividad heredadas también siguen ejecutándose.

Consulta [el entorno aislado](../../infra/development/README.md) para ejecutar
`migrate dev`, shadow y pruebas. La primera migración es aditiva: crea un enum,
tres tablas, índices y constraints; no borra ni transforma datos existentes.
El despliegue continúa usando el override manual documentado en el README raíz.

## Contraseñas y sesiones — Subfase 1.2

`AuthModule` consume la interfaz pública de `UsersModule`. `createIdentity`,
`findByEmail` y `findIdentityById` seleccionan identidad sin hash. La proyección
de credenciales es exclusivamente interna; los contratos HTTP enumeran solo
id, nombres, apellidos, username, email y rol. Swagger marca password writeOnly.

`User.passwordHash` es nullable y no tiene default. Una identidad sin contraseña
no puede iniciar sesión; ninguna operación de 1.2 asigna contraseña al crearla.
Primer acceso permite establecerla en 1.3; restablecimiento administrativo la sustituye en 1.4.

### Contraseña

Argon2id mediante `argon2`: 65536 KiB, tres iteraciones, paralelismo uno, salt de
la biblioteca y PHC completo. Se aplica NFC al hash y verificación, sin trim ni
cambios de espacios/capitalización. La política preparada para nuevas contraseñas
es 15–128 puntos de código después de NFC. Login permite entradas no vacías con
máximo 128 puntos normalizados y límite previo de 256 unidades UTF-16.

Un hash de referencia se genera una vez por arranque para verificar solicitudes
de cuentas inexistentes/sin contraseña con trabajo Argon2 comparable. No pertenece
a un usuario. Todos los rechazos de credenciales utilizan 401 genérico. Tras login
correcto se rehashan parámetros antiguos mediante reemplazo condicional; si la
credencial cambió durante la verificación, no se crea sesión. No se almacena
passwordChangedAt y un rehash no representa un cambio personal de contraseña.

### Sesiones y coordinación

`UserSession` conserva UUID, SHA-256 hexadecimal único del token, userId,
createdAt, expiresAt y revokedAt. El token procede de 32 bytes aleatorios y usa
Base64URL canónico sin padding. Solo se emite en cookie; no se persiste en plano,
no aparece en JSON, URL ni logs. No se almacenan IP, User-Agent o rol duplicado.

TTL absoluto por defecto 28800 segundos. No hay renovación ni scheduler. Una
sesión expirada o revocada es inválida aunque la fila permanezca. Los CHECK de
la segunda migración protegen fechas y formato SHA-256; las FK usan RESTRICT.
Hay índices por usuario y expiración y se permiten varias sesiones por usuario.

`SessionGuard` consulta sesión, fechas e identidad vigente en cada petición;
comprueba isActive y recupera el rol actual, sin aplicar todavía RBAC.
`UserAccessService.deactivate` es interno, sin endpoint: usa el lock del usuario
para cambiar estado/fecha y revocar todas las sesiones en la misma transacción.
La operación administrativa de 1.6 deberá consumir este servicio. Cambiar solo
isActive mediante SQL bloquea acceso inmediato, pero no sustituye esa coordinación.

Login verifica y calcula rehash antes del lock. Bajo un `SELECT ... FOR UPDATE`
parametrizado, vuelve a comprobar estado y hash, revoca la cookie anterior y crea
la nueva sesión. Desactivación usa el mismo lock; las sesiones antiguas no reviven
al reactivar. No se mantiene una transacción abierta durante Argon2.

### HTTP, cookie y entorno

| Endpoint | Contrato |
| --- | --- |
| POST `/api/v1/auth/login` | JSON email/password; 200 identidad y Set-Cookie; 401 genérico |
| POST `/api/v1/auth/logout` | JSON `{}`; 204, revocación actual y cookie expirada |
| GET `/api/v1/auth/me` | 200 identidad vigente; 401 sin sesión válida |

Todos los resultados de estas rutas, incluidos errores, usan `Cache-Control:
no-store`. Logout es idempotente ante cookie ausente/desconocida o sesión ya
revocada/expirada. Si falla la persistencia, no confirma revocación ni borra la
cookie. Login fallido conserva la sesión anterior; login correcto reemplaza solo
la sesión del navegador, manteniendo otras sesiones.

Cookie `cecasem_session`: HttpOnly, SameSite=Lax, Path=/api/v1, sin Domain y
Max-Age según TTL. Su borrado comparte scope y atributos. `cookie` es dependencia
directa de lectura; no se utiliza cookie-parser ni express-session.

Solo se añaden `SESSION_TTL_SECONDS` (1–604800, default 28800) y
`SESSION_COOKIE_SECURE` (true/false explícito, default false). Usar true con HTTPS;
NODE_ENV=production no implica HTTPS en la LAN actual. No existe SESSION_SECRET.
El despliegue conserva mismo origen Nginx/Vite y no habilita CORS. Se exige JSON
en operaciones mutadoras; no se añaden APP_ORIGIN ni infraestructura de throttling.
Rate limiting, controles adicionales de origen y endurecimiento para Internet
quedan deliberadamente pendientes. HTTP no protege el transporte de credenciales.

### Validación y mediciones

`test/auth.integration-spec.ts` combina persistencia y HTTP real en PostgreSQL
dedicado `_test`. Limpia solo UUID propios y sus sesiones. Cubre constraints,
login/logout/me, cookies, errores, múltiples sesiones, rehash y concurrencia.
Los fixtures generan credenciales aleatorias en ejecución; no hay usuarios seed.

Después de build, desde `apps/api` en PowerShell:

```powershell
Get-Content ../../infra/development/benchmark-password.cjs -Raw | node -
```

Para el contenedor runtime, desde raíz:

```powershell
Get-Content infra/development/benchmark-password.cjs -Raw | docker compose exec -T api node -
```

La medición usa el servicio compilado, warmup y cinco muestras por operación;
no crea usuarios ni imprime contraseñas/hashes. En este equipo con Node 24.21.0:
Windows hash media/máximo 111/114 ms y verify 116/123 ms; Docker Linux hash
155/163 ms y verify 158/168 ms. Son mediciones locales sin carga concurrente.

La comprobación de navegador se realizó con fixture temporal en una base limpia
aislada: login, navegación, refresh, me=200, logout, redirección y me=401. La cookie
no fue visible a JavaScript del frontend y los dos almacenamientos tenían cero
entradas. Los atributos se validaron también por HTTP/E2E. Se eliminaron el
fixture y los contenedores auxiliares; no se incorporaron endpoints diagnósticos.

## Primer acceso — 1.3

FirstAccessToken conserva UUID, destinatario userId, emisor createdByUserId,
tokenHash único, createdAt, expiresAt, usedAt y revokedAt. Ambas relaciones usan
RESTRICT. Índices por destinatario y emisor; no existe índice parcial ni estado enum.
Los CHECK validan fechas, exclusión entre uso/revocación y digest hexadecimal.
La tercera migración es 20261001230230_first_access; las anteriores no cambian.

| Endpoint | Contrato |
| --- | --- |
| POST /api/v1/auth/first-access-tokens | JSON userId; sesión válida de ADMINISTRATOR; 201 token/expiresAt |
| POST /api/v1/auth/first-access | JSON token/password; anónimo; 204 sin identidad ni Set-Cookie |

La comprobación localizada de ADMINISTRATOR deberá integrarse al RBAC de 1.5.
El emisor se deriva de la sesión; el body no acepta createdByUserId. El servicio
comprueba también identidad vigente del emisor. Destinatario: existente, activo
y passwordHash=null. Errores administrativos: 404 inexistente, 409 inactivo/con
contraseña; 401 anónimo y 403 otro rol. No existe administración frontend.

La credencial es de 32 bytes aleatorios (256 bits), Base64URL canónico sin padding;
solo su SHA-256 se persiste. El token plano se devuelve una sola vez. No hay
recuperación/listado ni envío automatizado. El Administrador lo entrega por un
canal institucional verificado. La futura interfaz puede construir
/first-access#token=<TOKEN>. Nunca usar query ni path para el secreto, porque
Nginx registra la solicitud completa. No registrar token, digest, contraseña,
hash, cuerpo sensible ni enlace completo.

FIRST_ACCESS_TOKEN_TTL_SECONDS tiene default 86400 (24 h), rango 1–172800.
No hay nuevo secreto ni URL pública. Las dos operaciones requieren JSON y usan
Cache-Control: no-store incluso en errores mediante el middleware de auth.
Mismo origen; no se habilita CORS. HTTP no protege el transporte de credenciales.

Emisión, consumo y desactivación bloquean primero User. Cada emisión revoca
anteriores pendientes, incluso expirados, y crea un token nuevo. Argon2id se
calcula fuera de la transacción de consumo. Tras el lock se comprueban estado,
hash nulo y expiración usando un instante nuevo; una actualización condicional
marca el uso. Establecimiento inicial, consumo, revocación de otros pendientes y
sesiones se confirman juntos o hacen rollback. Desactivar revoca sesiones y
tokens en la misma transacción; reactivar no revive credenciales antiguas.

La contraseña respeta NFC, 15–128 puntos de código, Unicode y espacios sin trim.
400 de token inválido/expirado/usado/revocado o usuario no habilitado es uniforme;
la política de contraseña devuelve un error de validación separado. Sesión
válida del navegador: 409 sin cambios; cookie ausente/inválida/expirada/revocada
se trata como anónimo. No se crea sesión automáticamente: usar login posterior.
Primer acceso no ofrece validación previa ni restablecimiento; el reset se implementa por separado en 1.4.

Pruebas en test/first-access.integration-spec.ts: persistencia/constraints,
HTTP completo, regeneración, rollback, sesiones y carreras con barreras. Ejecutar
solo sobre PostgreSQL dedicado terminado en _test. La limpieza elimina únicamente
UUID propios y sus referencias. No hay seeds permanentes.

## Restablecimiento administrativo — 1.4

PasswordResetToken es específico: UUID, userId, createdByUserId, tokenHash,
createdAt, expiresAt, usedAt y revokedAt. Relaciones nombradas con RESTRICT,
hash único y CHECK temporal/formato/terminal. Índices por destinatario y emisor;
no se añade índice por expiración porque no hay consultas de limpieza ni scheduler.
FirstAccessToken y las tres primeras migraciones permanecen intactos.

| Endpoint | Contrato |
| --- | --- |
| POST /api/v1/auth/password-reset-tokens | JSON userId; Administrador autenticado; 201 token/expiresAt |
| POST /api/v1/auth/password-reset | JSON token/password; anónimo; 204 sin usuario, sesión ni Set-Cookie |

SessionGuard y comprobación localizada de ADMINISTRATOR protegen la emisión.
El servicio comprueba la identidad vigente del emisor. El body nunca acepta actor.
Destinatario existente/activo/con passwordHash. Errores: 401 anónimo, 403 otro rol,
404 inexistente, 409 inactivo o pendiente de primer acceso. El autoreset es permitido.

Token: utilidad opaca compartida, randomBytes(32), 256 bits, Base64URL canónico;
solo SHA-256 persistido. TTL PASSWORD_RESET_TOKEN_TTL_SECONDS=14400, rango 1–28800.
El plano se muestra una vez; entrega manual por canal institucional verificado.
Si se pierde, regenerar. No hay recuperación, listado, validación previa ni email.
URL de entrega relativa: /reset-password#token=<TOKEN>; nunca query o path.

Emisión/regeneración bloquean User, revocan pendientes incluso expirados, crean
nuevo token y AuditEvent en una única transacción. NO cambian hash, actividad,
login ni sesiones. Expirar el token no bloquea la cuenta. No existe estado de reset
obligatorio ni passwordResetRequiredAt. Login y consulta de sesiones no consultan resets.

Consumo verifica propuesta frente al hash vigente y calcula Argon2id fuera de
transacción. Se rechaza la contraseña actual, incluida su equivalencia NFC.
Luego se bloquea User, se revalida actividad/hash/expiración tras el lock y se consume
condicionalmente. Reemplazo por comparación de hash, revocación de otros resets y
sesiones y auditoría de finalización se confirman juntos o hacen rollback completo.
Un cambio concurrente de hash aborta; updatedAt no se usa como versión de credencial.

400 público uniforme para token/estado no habilitado. Política y reutilización
son errores separados. Una sesión válida de cualquier cuenta produce 409 hasta
logout explícito; cookies inválidas/expiradas/revocadas se tratan como anónimo.
JSON obligatorio, no-store también en errores, mismo origen sin CORS. Nunca loguear
contraseña, token, sus hashes, body sensible ni enlace completo. HTTP no protege transporte.

AuditEvent contiene solo UUID, action, actorUserId nullable, targetUserId,
passwordResetTokenId nullable y createdAt. Todas las relaciones usan RESTRICT;
índices target/fecha, actor y token. Las acciones actuales requieren token y
los CHECK validan actor: emisión/regeneración administrativo, finalización null.
Revocación acepta actor confiable o null para una llamada interna sin actor.
Estas restricciones deberán evolucionar explícitamente si se agregan acciones futuras.
Acciones: PASSWORD_RESET_ISSUED, PASSWORD_RESET_REGENERATED,
PASSWORD_RESET_COMPLETED y PASSWORD_RESET_REVOKED. Regeneración vincula el nuevo
reset; anteriores conservan revokedAt. Desactivación registra revocación por cada
reset afectado y coordina sesiones/primer acceso/reset dentro del mismo lock/tx.
Reactivar no revive tokens. Actor de deactivate es contexto interno confiable,
no input HTTP; la administración futura debe derivarlo de su sesión.

AuditService persiste en la transacción recibida, sin best-effort. Un fallo de
emisión/regeneración/finalización/revocación auditada provoca rollback de todo.
Se conservan tokens terminales y eventos; no hay eliminación ni scheduler.
No se guardan secretos, metadata genérica, IP, User-Agent o before/after.

Restricción operativa: si el único Administrador pierde todo acceso, 1.4 no
introduce mecanismo de emergencia. No hay contraseña maestra, seed ni bypass.
La autorización general y pantalla administrativa pertenecen a 1.5/1.6.

Pruebas: password-reset.spec.ts, password-reset.integration-spec.ts y frontend.
Integración sobre base _test con fixtures aleatorios; limpieza exclusiva de sus
UUID, audit events y referencias, sin reset ni eliminación de volúmenes.
