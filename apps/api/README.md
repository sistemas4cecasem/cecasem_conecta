# CECASEM Conecta API

Backend base de las subfases 0.2 y 0.4: NestJS, PostgreSQL y Prisma ORM 7.10.0.
No incluye autenticación, modelos de negocio ni seeds.

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

La ubicación configurada es `prisma/migrations`; las migraciones futuras deben
versionarse. No existe una primera migración porque el schema no contiene modelos
reales. Aparecerá con el primer modelo funcional, previsiblemente en Fase 1.1.
No se creó SQL vacío, modelos artificiales ni una carpeta de migraciones ficticia.

En una base nueva, `migrate status` puede indicar que aún no está gestionada y
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
