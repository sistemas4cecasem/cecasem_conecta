# Subfase 6.5 — Docker producción LAN

Esta guía conserva la configuración Docker preparada en 6.5 para validación local y para una futura operación LAN. La Fase 6 cierra integración y validación local; la instalación física, exposición en red y operación permanente corresponden a Fase 7. No reemplaza la configuración física del host, DHCP, firewall ni pruebas desde dispositivos institucionales.

## Requisitos y separación

Se requiere Docker Engine con contenedores Linux y Docker Compose v2. La composición raíz `docker-compose.yml` es el stack integrado configurable; desarrollo usa `infra/development/compose.yml`; demo usa `docker-compose.yml` más `docker-compose.demo.yml` y `.env.demo`. Usa siempre un nombre de proyecto, archivo(s) Compose y archivo de entorno explícitos. No ejecutes el overlay demo desde el proyecto raíz.

La composición raíz usa el proyecto `cecasem_conecta`, la demo `cecasem-demo` y desarrollo `cecasem_conecta_development`. El overlay de demo también declara su nombre y fija el puerto web aparte (`DEMO_WEB_PORT`, por defecto 8087), así un comando sin las opciones correctas no toma el proyecto ni el puerto web de producción. PostgreSQL demo se publica solo en loopback, por defecto 55437.

Imágenes base fijadas por versión y digest:

- API y etapa de build: Node 24.21.0 Bookworm slim, Yarn 4.18.1, instalación inmutable; runtime usa solo dependencias de producción y el usuario `node`.
- Web: Nginx 1.30.4 Alpine; runtime contiene Nginx y assets compilados, no Vite.
- DB: PostgreSQL 18.6 Bookworm.

## Crear configuración y secretos

Genera el archivo local una sola vez. El comando no sobrescribe archivos y no imprime credenciales:

```sh
node scripts/lan/create-env.mjs --http-lan
```

Para HTTP el modo debe elegirse de manera expresa. Si existe un terminador TLS interno delante de Nginx, configura la cookie segura con `--secure-cookie` y conserva ese terminador en el despliegue. El script genera contraseñas PostgreSQL aleatorias distintas, URL-escapables, y escribe `infra/production/.env` con permisos POSIX `0600`. En Windows, conserva el ACL privado del usuario. El archivo está ignorado por Git y excluido de los contextos Docker.

La plantilla sin secretos es `infra/production/.env.example`. No la uses directamente: sus credenciales están vacías y Compose debe rechazarlas. El archivo real `infra/production/.env` es distinto del `.env` local y de `.env.demo`.

Valida coherencia sin imprimir la configuración expandida:

```sh
node scripts/lan/validate-compose-config.mjs --env-file infra/production/.env --project-name cecasem_conecta
docker compose --project-name cecasem_conecta --env-file infra/production/.env -f docker-compose.yml config --quiet
```

El validador comprueba URL y credenciales de DB, nombre de base/rol, cookie, bind, redes internas, puertos, volumen de uploads, healthchecks y `NODE_ENV`. `docker compose config` sin `--quiet` puede mostrar secretos interpolados; no compartas esa salida.

Variables obligatorias: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_ADMIN_PASSWORD`, `DATABASE_URL` y `SESSION_COOKIE_SECURE`. La URL debe apuntar a `db:5432` y coincidir con la base, rol y password de aplicación; `POSTGRES_USER` no puede ser `postgres`. Contraseñas de muestra como `development_only`, `password`, `secret` o `changeme` son rechazadas por el validador.

Con defaults seguros/opciones: `WEB_BIND_ADDRESS`, `WEB_PORT`, `APP_PORT`, `FILE_STORAGE_ROOT`, `FILE_MAX_BYTES` y TTL. Compose usa `127.0.0.1` si no se configura `WEB_BIND_ADDRESS`; el asistente genera `0.0.0.0:8080` como override explícito para una futura prueba LAN y permite restringirlo a una IP del host. Traducción es opcional, desactivada por defecto y no bloquea el stack.

No existe una clave estática `SESSION_SECRET`: las sesiones usan tokens aleatorios revocables almacenados como hash. La autenticación depende de PostgreSQL y de la cuenta de aplicación.

## Build, DB y migraciones

Los comandos siguientes mantienen el proyecto explícito:

```sh
docker compose --project-name cecasem_conecta --env-file infra/production/.env -f docker-compose.yml build api web
docker compose --project-name cecasem_conecta --env-file infra/production/.env -f docker-compose.yml up -d --wait --wait-timeout 120 db
docker compose --project-name cecasem_conecta --env-file infra/production/.env -f docker-compose.yml -f infra/compose.migrations.yml run --build --rm api yarn workspace @cecasem-conecta/api prisma:migrate:deploy
docker compose --project-name cecasem_conecta --env-file infra/production/.env -f docker-compose.yml -f infra/compose.migrations.yml run --rm api yarn workspace @cecasem-conecta/api prisma:migrate:status
docker compose --project-name cecasem_conecta --env-file infra/production/.env -f docker-compose.yml up -d --wait --wait-timeout 120 api web
```

Las migraciones son una operación manual previa al arranque/actualización. No se ejecutan al reiniciar API. El servicio de migraciones usa la etapa de build, que contiene Prisma CLI; el runtime API no la incluye. Toma y verifica el backup requerido antes de una actualización de datos. Nunca sustituyas `migrate deploy` por `migrate dev` o `db push` en producción.

Para el primer administrador, cuando la API esté saludable:

```sh
docker compose --project-name cecasem_conecta --env-file infra/production/.env -f docker-compose.yml exec api node dist/bootstrap-admin.js --given-names "Nombres" --family-names "Apellidos" --email "admin@example.org"
```

El comando no acepta ni establece password. Devuelve un token temporal de primer acceso: consérvalo fuera de logs e historial compartido y entrégalo por un canal seguro. El Administrador define su propia contraseña desde `/first-access`.

## Servicios, puertos y health

Web es el único servicio publicado al host. Compose usa `127.0.0.1:8080` por defecto; el archivo generado para la futura prueba LAN fija explícitamente `WEB_BIND_ADDRESS=0.0.0.0`. API (3000) y PostgreSQL (5432) no publican puertos. API comparte la red `edge` con Nginx y la red `data` con PostgreSQL; `data` es interna y Web no está conectada a ella.

Nginx sirve `/`, aplica SPA fallback a rutas como `/login` y proxifica `/api/` al API. El tamaño límite proxy es 210 MiB para hasta diez archivos de 20 MiB más el overhead multipart. Timeouts proxy son 5 s de conexión y 120 s de envío/lectura. Assets Vite con nombre hash se comprimen con gzip y se cachean como inmutables; `index.html` se revalida.

- PostgreSQL usa `pg_isready`; API espera `service_healthy` y `/api/v1/health` ejecuta `SELECT 1` en la base.
- API tiene healthcheck HTTP y política `unless-stopped`.
- Web comprueba `/api/v1/health` a través de Nginx, no solo que el proceso Nginx exista.
- El API escucha dentro del contenedor; la publicación externa no se configura.

Nginx usa el resolver Docker `127.0.0.11` con TTL de 5 s y resolución de upstream por petición. Si API se reemplaza, puede haber un `502` breve durante la transición; Nginx vuelve a resolver `api` y recupera tráfico sin reiniciar Web.

## Same-origin, CORS y cookies

El navegador usa un mismo origen. Nginx conserva `/api/` y reenvía `Host`, `X-Real-IP`, `X-Forwarded-For` y `X-Forwarded-Proto`; no se habilita CORS con `*` ni hace falta CORS para el flujo normal.

La cookie `cecasem_session` es `HttpOnly`, `SameSite=Lax`, path `/api/v1`; `Secure` debe declararse. En HTTP se necesita `SESSION_COOKIE_SECURE=false`, pero credenciales y cookies viajan sin cifrar y pueden ser interceptadas dentro de la red. Se acepta solo para una prueba LAN temporal, privada y controlada, sin Wi-Fi de invitados ni equipos no confiables. HTTPS interno requiere un terminador TLS confiable y certificados propios de CECASEM; no se generan certificados ni se asume un dominio en 6.5. Antes de ampliar el acceso, migra a HTTPS y usa `SESSION_COOKIE_SECURE=true`.

## Archivos, persistencia y ciclo de vida

Los volúmenes nombrados son `<proyecto>_postgres_data` y `<proyecto>_private_files`. El primero se monta en `/var/lib/postgresql` para PostgreSQL 18; el segundo en `FILE_STORAGE_ROOT` (`/app/storage/private`). Los uploads se escriben como usuario `node`. DB y archivos sobreviven a `stop`, `start`, recreación y rebuild de imágenes. No uses `down --volumes`, `docker volume prune` ni borres directorios de volumen como procedimiento normal.

Comandos operativos:

```sh
docker compose --project-name cecasem_conecta --env-file infra/production/.env -f docker-compose.yml ps
docker compose --project-name cecasem_conecta --env-file infra/production/.env -f docker-compose.yml logs --tail 100 web api db
docker compose --project-name cecasem_conecta --env-file infra/production/.env -f docker-compose.yml stop
docker compose --project-name cecasem_conecta --env-file infra/production/.env -f docker-compose.yml start
docker compose --project-name cecasem_conecta --env-file infra/production/.env -f docker-compose.yml up -d --wait --wait-timeout 120
```

Para actualizar: backup verificado, construir API/Web, iniciar DB, aplicar migraciones manualmente, comprobar `migrate status` y levantar API/Web con `--wait`. Para recuperar, revisa health y logs de servicio; al recrear solo API no reinicies Web como workaround. `docker compose down` conserva volúmenes, pero elimina contenedores/redes; no lo confundas con `down --volumes`.

## Demo y desarrollo

Usa siempre el entorno demo con su proyecto y overlay explícitos:

```sh
docker compose --project-name cecasem-demo --env-file .env.demo -f docker-compose.yml -f docker-compose.demo.yml up --build -d
```

La demo mantiene sus volúmenes separados y su preparación sigue siendo manual mediante los scripts existentes. No se incluye XLSX, dataset, usuario demo ni contraseña demo en imágenes de producción. Desarrollo continúa usando `infra/development/compose.yml` y su proyecto/volumen independiente.

La instalación física, reserva DHCP, firewall del host, pruebas desde dispositivos reales y reinicio del host se planifican y validan en Fase 7.
