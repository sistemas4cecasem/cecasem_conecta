# PostgreSQL aislado para desarrollo y pruebas

Este Compose es independiente del principal: otro proyecto, red y volumen.
Publica PostgreSQL únicamente en `127.0.0.1`, por defecto en el puerto 55432.
Nunca contiene datos institucionales. No lo combines con `docker-compose.yml`.

Desde la raíz, para una prueba exclusivamente local:

```powershell
docker compose --env-file infra/development/.env.example -f infra/development/compose.yml up -d --wait --wait-timeout 60
```

El archivo de ejemplo contiene credenciales públicas solo para este entorno.
Puedes usar un `.env` local ignorado con tus propios valores. Las variables
`DEV_POSTGRES_PORT` y `DEV_POSTGRES_PASSWORD` configuran el puerto y la contraseña.
Los caracteres especiales en credenciales deben codificarse en las URLs.

Se crean dos bases distintas al inicializar el volumen:

- `cecasem_conecta_development`: desarrollo y `migrate dev`.
- `cecasem_conecta_test`: integración y aplicación de migraciones desde base limpia.

La cuenta `postgres` tiene privilegios administrativos **solo en este contenedor
aislado**. Prisma crea y elimina automáticamente su propia base shadow aquí.
No hay que configurar una shadow persistente ni modificar los privilegios de la
cuenta runtime del Compose principal. Nunca apuntes `migrate dev` a ese runtime.

## Migraciones y pruebas desde PowerShell

```powershell
$env:DATABASE_URL = 'postgresql://postgres:development_only@127.0.0.1:55432/cecasem_conecta_development'
yarn workspace @cecasem-conecta/api prisma:migrate:dev
yarn workspace @cecasem-conecta/api prisma:migrate:status

$env:DATABASE_URL = 'postgresql://postgres:development_only@127.0.0.1:55432/cecasem_conecta_test'
yarn workspace @cecasem-conecta/api prisma:migrate:deploy
yarn workspace @cecasem-conecta/api prisma:migrate:status
yarn workspace @cecasem-conecta/api test:integration
Remove-Item Env:DATABASE_URL
```

Para **generar una nueva migración antes de aplicarla**, usa el script real:

```powershell
yarn workspace @cecasem-conecta/api prisma:migrate:dev --name nombre_del_cambio --create-only
```

Inspecciona el SQL y añade los CHECK necesarios antes de la primera aplicación.
El `schema.prisma` no representa esos CHECK; se conservan en el historial SQL.
Después, `prisma:migrate:dev` aplica la migración revisada y verifica el historial
mediante la shadow. No aceptes un reset ante drift: investiga su causa.

La suite de identidades rechaza URLs cuyo nombre de base no termina en `_test`.
Además, cada prueba usa identidades propias y limpia únicamente sus UUID, con
eliminación explícita de las asociaciones antes de las filas referenciadas.
No hay TRUNCATE ni limpieza global. No ejecutes estas pruebas contra runtime.

El volumen permite repetir pruebas sin resets. Para otra comprobación desde una
base totalmente limpia, crea una **base adicional de pruebas** dentro de este
contenedor y aplica `prisma:migrate:deploy`; no borres una base existente.

## Parada

```powershell
docker compose --env-file infra/development/.env.example -f infra/development/compose.yml stop
```

Esto conserva el volumen y no detiene los servicios del Compose principal.
El script `init-test.sql` solo se ejecuta en el primer arranque con volumen vacío.
