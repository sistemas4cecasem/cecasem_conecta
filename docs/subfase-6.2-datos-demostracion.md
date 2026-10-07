# Subfase 6.2 — Datos de demostración

El dataset 6.2 se genera en una instancia Docker Compose aislada llamada `cecasem-demo`. El guion usa únicamente la API normal de CECASEM Conecta; no inserta ni corrige fichas directamente en PostgreSQL. Su fuente versionada es `scripts/demo/demo-workbook.mjs`; el XLSX se genera en `storage/demo/` y pasa por inspección, preview y confirmación de la importación existente.

Todo dato del archivo y del relato es ficticio. Los correos usan `example.test`; los enlaces usan `example.test`. La columna `Categoría propuesta` se conserva en la fuente y aparece como columna sin mapear en el preview porque la importación actual no asigna categorías. La organización principal recibe una categoría de demo mediante el flujo normal del Directorio.

## Preparación desde una base limpia

1. Copia `.env.example` a `.env.demo`, cambia `POSTGRES_DB` a `cecasem_demo`, asigna contraseñas aleatorias propias a `POSTGRES_PASSWORD` y `POSTGRES_ADMIN_PASSWORD`, y actualiza `DATABASE_URL` para que coincidan usuario, contraseña y base. Configura `DEMO_WEB_PORT=8087`, `APP_PORT=3000` y `DEMO_DB_PORT=55437`. `.env.demo` queda excluido por `.gitignore`.
2. Construye y arranca solo el proyecto Compose de demostración:

   ```powershell
   docker compose --project-name cecasem-demo --env-file .env.demo -f docker-compose.yml -f docker-compose.demo.yml up --build -d
   $env:DATABASE_URL = ((Get-Content .env.demo | Select-String '^DATABASE_URL=').Line -replace '^DATABASE_URL=', '').Replace('@db:5432/', '@127.0.0.1:55437/')
   yarn workspace @cecasem-conecta/api prisma:migrate:deploy
   yarn workspace @cecasem-conecta/api prisma:migrate:status
   Remove-Item Env:DATABASE_URL
   ```

   El override usa `!override` y requiere Docker Compose 2.24.4 o superior. Verifica que estén aplicadas las 57 migraciones esperadas. El proyecto publica la web en `http://127.0.0.1:8087` y PostgreSQL solo en `127.0.0.1:55437`. El preparador rechaza cualquier host remoto, cualquier puerto distinto de 8087 y `localhost:8080`.
3. Crea el primer Administrador con el CLI offline existente. El token se captura en una variable de PowerShell para no mostrarlo:

   ```powershell
   $firstAccessJson = docker compose --project-name cecasem-demo --env-file .env.demo exec -T api node dist/bootstrap-admin.js --given-names Administrador --family-names Demo --email admin@demo.example.test
   $firstAccessToken = ($firstAccessJson | ConvertFrom-Json).token
   ```

   Abre `http://127.0.0.1:8087/first-access`, completa el primer acceso con una contraseña propia de al menos 15 caracteres y cierra la sesión del navegador. El CLI solo emite el token; no define contraseña ni publica una puerta de autenticación.
4. En PowerShell, toma la contraseña elegida mediante el prompt seguro y ejecuta `yarn demo:prepare`:

   ```powershell
   $credential = Get-Credential -UserName 'admin@demo.example.test' -Message 'Administrador local de demo'
   $env:CECASEM_DEMO_ADMIN_EMAIL = $credential.UserName
   $env:CECASEM_DEMO_ADMIN_PASSWORD = $credential.GetNetworkCredential().Password
   yarn demo:prepare
   Remove-Item Env:CECASEM_DEMO_ADMIN_EMAIL
   Remove-Item Env:CECASEM_DEMO_ADMIN_PASSWORD
   ```

   El guion crea los usuarios y el relato institucional mediante endpoints autenticados. Para cada hoja imprime análisis, advertencias, errores y coincidencias; confirma cada preview solo cuando se escribe `IMPORTAR-6.2`. Las filas inválidas quedan sin aplicar. En una coincidencia posible única, el guion propone vincularla a la ficha existente y registra esa decisión explícita.

   La primera cuenta Administrador debe coincidir con el correo usado en el paso 3. No se necesita conocer ningún UUID: el guion encadena las referencias que devuelve cada API.

5. Para detener la web sin borrar datos, usa `docker compose ... stop`. Para reconstruir intencionalmente desde cero, el comando acotado al proyecto demo es:

   ```powershell
   docker compose --project-name cecasem-demo --env-file .env.demo -f docker-compose.yml -f docker-compose.demo.yml down --volumes
   ```

   Esto elimina la base y el volumen privado pertenecientes a `cecasem-demo`. No lo ejecutes con otro nombre de proyecto.

## Contenido resultante

- Una organización principal ficticia en Bolivia, una segunda ficha ficticia de nombre parecido que permanece como candidata pendiente de revisión humana, una categoría de cooperación comunitaria, una persona de contacto y dos correos reservados para prueba.
- Una intención convertida por Búsqueda Demo; una comunicación enviada por ese usuario y una respuesta registrada por otro usuario de Búsqueda.
- Una oportunidad enlazada a la respuesta y al proceso, en estado `PREPARING`; una reunión futura en `America/La_Paz` vinculada a ambos y con participantes internos y externos.
- Una segunda organización ficticia con una restricción activa de no contacto y motivo explícito.
- Cuatro hojas Excel: `Organizaciones` (4 filas analizadas: 3 para revisión y 1 inválida), `Personas` (2 importadas, sin inválidas), `Contactos` (3 analizadas: 2 importadas y 1 inválida) y `Antecedentes` (2 analizadas: 1 para revisión y 1 inválida). Incluyen Bolivia, Perú, Paraguay y Ecuador, registros completos y parciales, y una coincidencia posible vinculada a la ficha exacta mientras se conserva la advertencia de la candidata similar.
- Las fichas nuevas creadas por importación conservan `dataImportBatchId`, estado pendiente de verificación y `lastVerifiedAt = null`. Importar la muestra no crea comunicaciones ordinarias ni registros de verificación.

El archivo `storage/demo/demo-accounts.local.json` contiene las credenciales generadas al azar de las cuatro identidades añadidas (Directorio, dos cuentas de Búsqueda y Planificación) y de la cuenta Administrador usada en la preparación. `storage/` está excluido de Git; conserva ese archivo en el equipo de demo y no lo copies al repositorio. Las contraseñas no se imprimen, no se fijan en el código y pueden cambiarse con las herramientas normales de administración.

La preparación no es reejecutable sobre datos existentes: detecta los correos, nombres institucionales y lotes de importación de 6.2 y se detiene antes de crear fichas. Para repetir, reconstruye únicamente la base del proyecto aislado como se indica arriba y vuelve a emitir el primer acceso.

## Comprobaciones

Pruebas rápidas del libro y de las barreras locales:

```powershell
yarn demo:test
```

Integración completa sobre una base PostgreSQL vacía y desechable llamada exactamente `cecasem_demo_test`:

```powershell
docker compose --project-name cecasem-demo --env-file .env.demo -f docker-compose.yml -f docker-compose.demo.yml exec -T db createdb -U postgres cecasem_demo_test
$env:DATABASE_URL = 'postgresql://cecasem:<contraseña>@127.0.0.1:<puerto>/cecasem_demo_test?schema=public'
yarn workspace @cecasem-conecta/api prisma:migrate:deploy
yarn workspace @cecasem-conecta/api test:integration --testPathPatterns=demo-preparation.integration-spec.ts
Remove-Item Env:DATABASE_URL
```

La prueba ejecuta el mismo preparador contra una app Nest real. Compara PostgreSQL antes/después de cada preview, comprueba procedencia y fechas de verificación, valida una denegación por rol, e intenta repetir la ejecución. Usa una instancia PostgreSQL local desechable y vacía; no la apuntes a la base de demo, a `_test` compartidas ni a producción.
