# CECASEM Conecta

Base técnica de Fase 0: monorepo Yarn, API NestJS, React/Vite y PostgreSQL/Prisma.
Todavía no contiene autenticación ni funcionalidades de negocio.

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
| `WEB_PORT` | Único puerto publicado; ejemplo `8080` |
| `APP_PORT` | Puerto interno API, también configurado en Nginx; ejemplo `3000` |
| `POSTGRES_DB` | Nombre de la base de aplicación |
| `POSTGRES_USER` | Cuenta de aplicación, distinta de `postgres` |
| `POSTGRES_PASSWORD` | Contraseña de esa cuenta |
| `POSTGRES_ADMIN_PASSWORD` | Contraseña diferente para el usuario administrador `postgres` |
| `DATABASE_URL` | URL de aplicación; debe coincidir con las variables DB y usar `db:5432` |

Codifica los caracteres especiales del usuario/contraseña de `DATABASE_URL`
como componentes URL. Las variables DB conservan los valores originales.
No uses `localhost` como host de base dentro de Compose. Las variables se inyectan
en runtime; no se copian archivos `.env` ni se incorporan secretos al build.
`apps/api/.env.example` corresponde a ejecución local sin Docker;
`apps/web/.env.example` documenta el proxy Vite de desarrollo.

## Construir y levantar

```sh
docker compose config --quiet
docker compose build
docker compose up -d --wait --wait-timeout 120
docker compose ps
```

Abre `http://localhost:8080` o el puerto configurado. Solo Web publica un puerto;
API y DB se comunican por nombres de servicio en la red privada de Compose.
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
docker compose ps
docker compose logs --tail 100 web api db
docker compose stop db
docker compose up -d db
docker compose down
```

`GET /` devuelve la SPA. `GET /api/v1/health` desde el mismo origen devuelve
`{"status":"ok","database":"ok"}` con HTTP 200 cuando PostgreSQL responde.
Si DB cae, devuelve 503 y el healthcheck API pasa a `unhealthy`; la API puede
recuperarse cuando DB vuelve. El healthcheck Web verifica que Nginx responde,
no la salud de DB. PostgreSQL usa `pg_isready` y API espera a DB saludable.

Usa `docker compose up -d --wait --wait-timeout 120` para comprobar nuevamente
el conjunto tras restaurar DB. No se usan pausas arbitrarias para readiness.
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

Todavía no existen modelos ni migraciones funcionales. No se inventa ninguna y
no se ejecutan migraciones automáticamente al iniciar API. Antes de un despliegue
con migraciones reales, prepara DB y ejecuta el comando manual:

```sh
docker compose up -d --wait db
docker compose -f docker-compose.yml -f infra/compose.migrations.yml run --build --rm api yarn workspace @cecasem-conecta/api prisma:migrate:deploy
docker compose up -d --wait --wait-timeout 120
```

El override usa la etapa de build, que contiene Prisma CLI, con la misma conexión
y red. No altera la imagen runtime ni añade un cuarto servicio permanente.
Prisma CLI solo se necesita para esta operación. Usa `migrate deploy`, nunca
`migrate dev` ni `db push` en un despliegue. La primera migración real corresponde
al primer modelo funcional, previsiblemente en Fase 1.1.

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
docker compose exec -T db psql -U postgres -d postgres -Atc "SELECT system_identifier FROM pg_control_system()"
```

Ante fallos, revisa `ps` y logs del servicio afectado. Si faltan variables, Compose
lo indicará antes de crear contenedores. Si el puerto Web está ocupado, cambia
`WEB_PORT`. Si API no conecta, revisa coherencia de credenciales y hostname `db`.
Si recreas API por separado, reinicia Web para que Nginx vuelva a resolver su
dirección interna. Si Docker Desktop falla, diagnostica el daemon antes de continuar;
no uses restablecimiento de fábrica ni limpieza global como solución automática.
