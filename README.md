# CECASEM Conecta

CECASEM Conecta centraliza el directorio institucional, procesos de relación,
comunicaciones registradas, oportunidades, reuniones, importaciones, archivos y
su historial de auditoría. Usa un monorepo Yarn con API NestJS, web React/Vite y
PostgreSQL/Prisma.

La Fase 6 consolidó integración, QA y validación local. La instalación física y
la operación permanente en LAN o VPS corresponden a Fase 7.

La [guía Docker](docs/subfase-6.5-docker-produccion-lan.md) documenta el stack reproducible para validación local y su configuración para una futura operación LAN; la instalación física y operación quedan para Fase 7.

La ruta `/` requiere sesión y `/login` permite iniciar sesión. El Administrador
crea cada cuenta y asigna una contraseña inicial; al entrar con ella, la persona
debe cambiarla. El Administrador también puede restablecerla asignando una nueva
contraseña inicial. No hay primer acceso ni recuperación mediante token, ni envío
automático de correo. Los cambios de contraseña revocan las sesiones activas y
quedan auditados. Los perfiles permiten corregir nombres y correo; el nombre de
usuario se genera automáticamente y no se edita. Siempre debe quedar al menos un
Administrador activo. Consulta el detalle en [Administración mínima](docs/subfase-1.6-administracion.md).

## Requisitos y configuración Docker

Docker Engine debe funcionar con contenedores Linux y Docker Compose v2.
Comprueba `docker version`, `docker info` y `docker compose version`.
Los builds usan Node 24.21.0, Yarn 4.18.1, Nginx 1.30.4 y PostgreSQL 18.6;
las imágenes base están fijadas por versión y digest.

Desde la raíz, copia `.env.example` a `.env` local o proporciona variables del
proceso. El archivo real está ignorado por Git; nunca lo versiones. Para una
prueba exclusivamente local puedes usar `--env-file .env.example` en los comandos
Compose. Sus contraseñas son ejemplos compartidos, no credenciales de producción.

| Variable | Uso |
| --- | --- |
| `WEB_PORT` | Puerto del host publicado para la Web; ejemplo `3000` |
| `APP_PORT` | Puerto interno API, también configurado en Nginx; ejemplo `3000` |
| `DB_HOST` | Host de TablePlus; conserva `localhost` |
| `DB_PORT` | Puerto local publicado para TablePlus; ejemplo `5432` |
| `DB_NAME` | Nombre de la base de aplicación |
| `DB_USER` | Usuario de aplicación, con permisos limitados |
| `DB_PASSWORD` | Contraseña del usuario de aplicación |
| `DB_ADMIN_PASSWORD` | Contraseña diferente para la cuenta administradora `postgres` |
| `SESSION_COOKIE_SECURE` | Selección obligatoria: `false` solo para HTTP de prueba; `true` detrás de HTTPS |

Compose genera la conexión interna de la API a partir de `DB_NAME`, `DB_USER` y
`DB_PASSWORD`, usando el host de servicio `db`. No hace falta definir
`DATABASE_URL` en `.env`. Usa usuario y contraseña con letras, números, guion o
guion bajo para que Compose pueda formar esa conexión sin ambigüedades. Las variables se
inyectan en runtime; no se copian archivos `.env` ni se incorporan secretos al build.
`apps/api/.env.example` corresponde a ejecución local del API en el host, incluso
cuando PostgreSQL está en Docker;
`apps/web/.env.example` documenta el proxy Vite de desarrollo.
Los archivos `.env` antiguos deben declarar explícitamente `SESSION_COOKIE_SECURE`;
producción usa `infra/production/.env` y no reutiliza la configuración local.

### Desarrollo con Docker activo

Para trabajar con recarga automática sin detener el stack, conserva Docker
levantado y ejecuta `yarn dev` desde la raíz. Docker publica la Web en
`http://localhost:3000` y PostgreSQL en `localhost:5432`; el API de desarrollo
usa `http://localhost:3001` y se conecta a esa misma base. Vite publica la Web
de desarrollo en `http://localhost:5173` y envía `/api` al API local en `3001`.

En la configuración inicial, crea `apps/api/.env` a partir de
`apps/api/.env.example` y define `DATABASE_URL` con `localhost`, `DB_PORT`,
`DB_NAME`, `DB_USER` y `DB_PASSWORD` del `.env` raíz. Conserva `APP_PORT=3001`.
Si hace falta, crea `apps/web/.env` desde `apps/web/.env.example` y conserva
`API_PROXY_TARGET=http://localhost:3001`. Estos dos archivos locales están
ignorados por Git. Aplica las migraciones pendientes una vez con
`yarn workspace @cecasem-conecta/api prisma:migrate:deploy`; después, para el
trabajo diario basta con `yarn dev` y abrir `http://localhost:5173`.
Los archivos subidos desde esta instancia se guardan en `storage/private` del
host; el volumen de archivos de la instancia Docker es independiente.

## Construir y entrar por primera vez

```sh
docker compose --project-name cecasem_conecta --env-file .env -f docker-compose.yml config --quiet
docker compose --project-name cecasem_conecta --env-file .env -f docker-compose.yml build
docker compose --project-name cecasem_conecta --env-file .env -f docker-compose.yml up -d --wait db
docker compose --project-name cecasem_conecta --env-file .env -f docker-compose.yml -f infra/compose.migrations.yml run --build --rm api yarn workspace @cecasem-conecta/api prisma:migrate:deploy
docker compose --project-name cecasem_conecta --env-file .env -f docker-compose.yml up -d --wait --wait-timeout 120
docker compose --project-name cecasem_conecta --env-file .env -f docker-compose.yml ps
```

Antes de estos comandos, copia `.env.example` a `.env`. En una base nueva,
`migrate deploy` crea las tablas. Puedes crear un Administrador con
`bootstrap-admin` o cargar el conjunto ficticio de prueba ejecutando
`yarn workspace @cecasem-conecta/api prisma:seed` después de migrar. El seed crea
10 usuarios con los cuatro roles, 10 organizaciones, 20 personas relacionadas de
a dos por organización y datos de procesos, comunicaciones, intenciones,
restricciones, oportunidades y reuniones. No borra otros datos de la base.

Las cuentas usan correos `@seed.example.test` y comparten una contraseña aleatoria
guardada localmente en `storage/seed/demo-accounts.local.json`, archivo ignorado
por Git. Consulta ese archivo para iniciar sesión. Los datos son ficticios y los
contactos quedan pendientes de verificación. No ejecutes también `bootstrap-admin`
salvo que necesites una cuenta adicional.

Si prefieres crear manualmente un único Administrador, usa este comando en vez del
seed; solicita una contraseña inicial de forma oculta y pedirá cambiarla al iniciar
sesión:

```sh
docker compose --project-name cecasem_conecta --env-file .env -f docker-compose.yml exec api node dist/bootstrap-admin.js --given-names "Nombres" --family-names "Apellidos" --email "admin@example.org"
```

Compose publica la Web en todas las interfaces del computador sin requerir una
IP en `.env`. En el computador que ejecuta Docker, abre
`http://localhost:<WEB_PORT>`; desde otro equipo de la LAN, abre
`http://<IP-LAN-del-computador>:<WEB_PORT>`. En desarrollo local, TablePlus usa
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD` del `.env`; el host
es `localhost`. PostgreSQL solo acepta conexiones desde el computador donde
corre Docker. API y DB se comunican por el nombre de servicio `db` dentro de
la red privada de Compose.
Nginx sirve los assets React, conserva el fallback SPA y dirige `/api/` a NestJS.
La API ejecuta su build con `NODE_ENV=production`; Swagger permanece deshabilitado
según su política actual. No hay servidores de desarrollo Vite/Nest en runtime.

No se requieren Node, Yarn, PostgreSQL, `node_modules`, `dist` ni Prisma Client
en el host para construir con Docker. El contexto raíz incluye los manifests de
ambos workspaces y un único lockfile. `.dockerignore` excluye artefactos locales,
secretos y Git. API genera Prisma Client antes de compilar y conserva solo las
dependencias de producción; Web final contiene Nginx y el build estático.

## Salud, logs y parada

```sh
docker compose --project-name cecasem_conecta --env-file .env -f docker-compose.yml ps
docker compose --project-name cecasem_conecta --env-file .env -f docker-compose.yml logs --tail 100 web api db
docker compose --project-name cecasem_conecta --env-file .env -f docker-compose.yml stop db
docker compose --project-name cecasem_conecta --env-file .env -f docker-compose.yml up -d db
docker compose --project-name cecasem_conecta --env-file .env -f docker-compose.yml down
```

`GET /` devuelve la SPA. `GET /api/v1/health` desde el mismo origen devuelve
`{"status":"ok","database":"ok"}` con HTTP 200 cuando PostgreSQL responde.
Si DB cae, devuelve 503 y el healthcheck API pasa a `unhealthy`; la API puede
recuperarse cuando DB vuelve. El healthcheck Web consulta esa ruta a través de
Nginx, por lo que representa la salud del recorrido completo. PostgreSQL usa
`pg_isready` y API espera a DB saludable.

Usa `up -d --wait --wait-timeout 120` con el proyecto y archivo explícitos para
comprobar nuevamente el conjunto tras restaurar DB. No se usan pausas arbitrarias
para readiness.
`docker compose config` sin `--quiet` puede mostrar credenciales interpoladas:
no compartas esa salida. Los logs de aplicación no deben imprimirlas.

## Persistencia y cuenta de aplicación

El volumen `postgres_data` conserva PostgreSQL entre `down` y `up`. PostgreSQL 18
monta el volumen en `/var/lib/postgresql`, conforme a su
[imagen oficial](https://hub.docker.com/_/postgres).
No ejecutes `down -v` en el flujo normal: elimina la persistencia.

`infra/postgres/init-app.sql` solo se ejecuta con un volumen vacío. Crea la cuenta
de aplicación sin `SUPERUSER`, `CREATEDB` ni `CREATEROLE`, y concede conexión y
creación de objetos en el schema `public` para las futuras migraciones.
La cuenta administrativa no se entrega a API. Cambiar contraseñas en variables
no actualiza un volumen ya inicializado: cualquier rotación debe hacerse de forma
explícita en PostgreSQL, conservando los datos.

## Migraciones de despliegue

Las migraciones Prisma versionadas están en `apps/api/prisma/migrations`. No se
ejecutan automáticamente al iniciar API. Antes de desplegar una versión, prepara
DB y ejecuta el comando manual:

```sh
docker compose --project-name cecasem_conecta --env-file infra/production/.env -f docker-compose.yml up -d --wait db
docker compose --project-name cecasem_conecta --env-file infra/production/.env -f docker-compose.yml -f infra/compose.migrations.yml run --build --rm api yarn workspace @cecasem-conecta/api prisma:migrate:deploy
docker compose --project-name cecasem_conecta --env-file infra/production/.env -f docker-compose.yml up -d --wait --wait-timeout 120
```

El override usa la etapa de build, que contiene Prisma CLI, con la misma conexión
y red. No altera la imagen runtime ni añade un cuarto servicio permanente.
Prisma CLI solo se necesita para esta operación. Usa `migrate deploy`, nunca
`migrate dev` ni `db push` en un despliegue. Para desarrollo, shadow database y
pruebas con escrituras, utiliza el entorno separado de `infra/development/README.md`.

## Validación y problemas comunes

Con Node/Yarn disponibles en el host:

```sh
yarn install --immutable
yarn lint
yarn typecheck
yarn test
yarn build
git diff --check
```

Las pruebas de integración PostgreSQL se documentan en `apps/api/README.md`.
Para probar persistencia sin entidades de negocio, compara el identificador del
cluster antes y después de `down`/`up`:

```sh
docker compose --project-name cecasem_conecta --env-file infra/production/.env -f docker-compose.yml exec -T db psql -U postgres -d postgres -Atc "SELECT system_identifier FROM pg_control_system()"
```

Ante fallos, revisa `ps` y logs del servicio afectado. Si faltan variables, Compose
lo indicará antes de crear contenedores. Si el puerto Web está ocupado, cambia
`WEB_PORT`. Si API no conecta, revisa coherencia de credenciales y hostname `db`.
Nginx consulta el DNS interno de Docker para actualizar la dirección del API;
recrear API no requiere reiniciar Web. Si Docker Desktop falla, diagnostica el daemon antes de continuar;
no uses restablecimiento de fábrica ni limpieza global como solución automática.
