# FASE 2 — CORRECCIÓN RF-12

## Estado

**RF-12 CORREGIDO**. Validación ejecutada el 3 de octubre de 2026.
Este documento registra exclusivamente la corrección. El cierre formal de Fase 2
queda pendiente de la reauditoría final solicitada; no sustituye informes anteriores.

## Baseline y gap confirmado

- Rama `main`, HEAD `427e339741ba652a3c471a55dc28d1ac9ff1be4f`:
  `feat(busqueda): implementar búsqueda inicial del directorio`.
- Working tree inicialmente limpio; 17 migraciones y 1.243 pruebas aprobadas en la auditoría previa.
- La relación N:N y la asignación de varias categorías existían desde 2.1, pero
  faltaba consultar organizaciones por categoría en el backend y en el listado web.
- RF-12 y el alcance P0 aprobado de 2.1 exigen este filtro básico junto con estado.
  No se implementaron filtros globales, avanzados ni funcionalidades de Fase 5.

## Backend, API y PostgreSQL

El endpoint existente `GET /api/v1/organizations` admite `categoryId` opcional:

```text
GET /api/v1/organizations?categoryId=<uuid>&status=active&page=1&pageSize=25
```

`OrganizationQueryDto` extiende el DTO de Directorio únicamente para el listado de
organizaciones. No amplía las queries de categorías ni modifica sus operaciones.
El contrato conserva `name`, `parentId`, `status=active|inactive|all`, `page` y
`pageSize`; los filtros se combinan. El estado por defecto continúa siendo `active`.
Los límites siguen siendo página 1–1.000.000 y tamaño 1–100, por defecto 25.

`categoryId` ausente conserva el comportamiento previo; presente debe ser UUID.
Vacío, texto arbitrario, `null` o arrays se rechazan con 400. Un UUID válido sin
categoría existente devuelve **200 con `items: []` y `total: 0`**: el filtro no exige
un lookup adicional. Una categoría existente sin organizaciones también devuelve vacío.

Prisma aplica `categories: { some: { categoryId } }` sobre la relación N:N existente.
El filtrado ocurre en PostgreSQL, antes de paginar. `findMany` y `count` utilizan el
mismo `where` dentro de la transacción `RepeatableRead`; el total cuenta organizaciones.
Se conserva orden por nombre y UUID, `skip` y `take`. Varias categorías no duplican
la organización. No se descargan fichas para filtrarlas en Node ni en React.

## Frontend y RBAC

El listado existente incorpora **Categoría**, con **Todas las categorías** y el
catálogo paginado. Consulta `categories?status=all&page=…` para permitir también
consultar asociaciones a categorías inactivas, identificadas como tales. No descarga
todas las páginas del catálogo; sus controles permiten recorrerlo y conservan la
opción elegida aunque corresponda a otra página.

Seleccionar categoría vuelve a consultar el backend. Categoría, estado y nombre
se combinan; cambiar filtros vuelve a página 1. Paginar organizaciones conserva los
controles. Se respeta el estado local de esta pantalla, sin introducir persistencia
en URL. Hay carga del catálogo y del listado, vacío, error y reintento. Cada nueva
identidad reinicia el filtro; la gestión existente de autenticación limpia la caché
de Directorio al salir o cambiar de identidad/capabilities.

Se reutiliza **`directory.read`**, con los guards existentes del backend. No se creó
capability nueva. Administrador, Directorio, Búsqueda y Planificación pueden filtrar;
las pruebas web lo demuestran incluso con permiso de lectura sin edición. Anónimos
reciben 401 y sesiones sin capability, 403 antes de consultar.

## Migraciones y alcance

**Ninguna migración nueva**: siguen existiendo 17. No se cambió Prisma schema,
Category, su normalización/CRUD/estado, la relación N:N, dependencias ni lockfile.

## Pruebas y evidencia RF-12

| Suite completa | Resultado final |
| --- | ---: |
| API: unitarias y e2e sin PostgreSQL, 25 suites | 379 aprobadas |
| Frontend, 16 archivos | 261 aprobadas |
| PostgreSQL/HTTP, 14 suites | 647 aprobadas |
| **Total de casos distintos** | **1.287 aprobados** |

Son **44 casos nuevos**: 6 de DTO, 21 PostgreSQL/HTTP y 17 de frontend.
El total cuenta cada suite una sola vez; no suma las ejecuciones repetidas en Windows/Linux.

PostgreSQL/HTTP usa A activa con X+Y, B inactiva con X, C activa con Z y D activa
sin categoría. Demuestra X+all = A/B; X+active = A; X+inactive = B; Y = A; Z = C;
categoría vacía y UUID inexistente = cero; sin filtro conserva las cuatro fichas según
estado. Comprueba total de organizaciones y ausencia de duplicados. Páginas de tamaño
1 con nombres iguales mantienen orden por UUID, total 2 y página fuera de rango vacía.
También prueba combinación con nombre/categoría inactiva, ausencia de cambios en
asociaciones, validación y los cuatro roles.

Frontend cubre consulta al backend, todas las categorías, combinación con estado,
página 1 al cambiar filtros, conservación durante paginación, catálogo paginado sin
descarga masiva, selección de categoría fuera de la página visible, vacío,
carga/error/reintento, logout, cambio de identidad y los cuatro roles con lectura.

## Aceptación manual en Docker

Se ejecutó el recorrido específico de 15 puntos en `http://localhost:8080`, después
de reconstruir y levantar la aplicación. Se crearon desde la interfaz cuatro
categorías QA y cuatro organizaciones: A Educación+Ambiente activa, B Educación
inactiva, C Salud activa y D activa sin categoría. La desactivación de B utilizó
la acción existente de Administrador.

| Selección real en el navegador | Resultado observado |
| --- | --- |
| Educación + Activas | A, total 1; B/C/D excluidas |
| Ambiente + Activas | A de nuevo, total 1 |
| Educación + Todas | A y B, total 2 |
| Educación + Inactivas | B, total 1 |
| Salud + Todas | C, total 1 |
| Sin coincidencias + Todas | Vacío y total 0 |
| Todas las categorías + Todas | A/B/C/D, total 4 |

Se inició sesión con los cuatro roles: Administrador realizó el recorrido completo;
Directorio y Planificación consultaron Educación+Todas; Búsqueda consultó
Ambiente+Activas. Cada nueva sesión presentó los filtros iniciales.
En viewport **390 × 844**, Planificación cambió estado a Activas manteniendo
Educación y encontró A una vez. La captura muestra ambos controles y paginación
utilizables; `clientWidth=375` y `scrollWidth=375`, sin desbordamiento horizontal.
Se restauró el viewport y se cerró la sesión QA; la aplicación quedó abierta en login.

Se retiraron los cuatro usuarios y credenciales, las cuatro organizaciones/categorías,
sesiones, historial/auditoría y candidatos QA generados por similitud al abrir fichas.
La comparación final de IDs en 17 modelos restituyó exactamente el baseline vacío;
VerificationSettings, incluidas fechas y versión, permaneció intacto. También se
eliminaron la base aislada `_test`, el contenedor de tests y los archivos temporales
con credenciales. Ninguna credencial ni dato runtime se incluye en Git.

Las evidencias locales están fuera del repositorio:
`C:/Users/USUARIO/.codex/visualizations/2026/10/02/01a0fd5c-eb60-7042-9150-fb0c56187849/rf12/`.
Contienen `aceptacion-manual.json`, `limpieza-qa.json`, `ambiente-activas.png`,
`rf12-390px.png`, logs completos de suites y los seis validadores históricos.
Las capturas corresponden a fixtures ya retirados.

## Validaciones y regresiones

| Comando / comprobación ejecutada | Resultado |
| --- | --- |
| `yarn lint` | Aprobado; se corrigieron dos accesos sin tipo en tests nuevos antes de la ejecución final |
| `yarn typecheck` | Aprobado |
| `yarn test` | Aprobado en Windows y Docker Linux: API 379 / frontend 261 |
| `yarn build` | Aprobado |
| `yarn workspace @cecasem-conecta/api prisma:generate` | Aprobado |
| `yarn workspace @cecasem-conecta/api prisma:validate` | Schema válido |
| `yarn workspace @cecasem-conecta/api prisma:migrate:status` | Ejecutado en servicio migrations: 17, al día |
| `yarn workspace @cecasem-conecta/api test:integration` | Docker Linux, PostgreSQL aislado: 647 aprobadas |
| `node infra/development/validate-directory-migrations.cjs --phase=2.1` a `--phase=2.6` | Los seis aprobados: instalaciones limpias y upgrades con datos preservados; QA retirada |
| `docker compose build api web` | Ambas imágenes reconstruidas |
| `docker compose -f docker-compose.yml -f infra/compose.migrations.yml run --rm --no-deps api yarn workspace @cecasem-conecta/api prisma:migrate:deploy` | Sin migraciones pendientes |
| `docker compose up -d --wait` / `docker compose ps` | db/api/web saludables |
| `GET /api/v1/health` a través de Nginx | 200, `status=ok`, `database=ok`, también después de retirar QA |
| `git diff --check` / revisión de diff y secretos | Aprobado |

El servicio migrations se utilizó también para `prisma:migrate:status`. Las suites
Linux conservaron la estrategia existente para Argon2 y una base aislada terminada
en `_test`; no se elevaron permisos del usuario de la aplicación ni se reinició la
base de Docker. **No se detectaron regresiones** en las suites completas y el recorrido.

## Warnings

- **Vite:** persiste el aviso de chunk mayor de 500 kB. Principal: 542,84 kB,
  gzip 157,01 kB; antes 541,50 / 156,67 kB. Build exitoso, sin ampliar scope con refactors.
- **Argon2 Windows:** no se reprodujo la limitación histórica; `yarn test` pasó en
  Windows. Se mantuvo y validó asimismo Docker Linux.
- **Otros existentes:** Jest informa VM Modules experimental; pg advierte sobre
  consultas concurrentes (retiro previsto en pg 9). Los escenarios que provocan
  fallos controlados del backend generan logs HTTP 500 esperados y sus tests pasan.
  Prisma anuncia una versión mayor candidata, sin actualización de dependencias.
  Git avisa de conversión LF/CRLF; `diff --check` no reporta errores.

## Estado Git

Ocho archivos de la corrección: DTO, controlador, servicio, tests de reglas y
PostgreSQL, listado web, nuevo archivo de tests web y este documento. El esquema,
las 17 migraciones y los informes anteriores permanecen sin cambios.
**Sin commit, sin push, sin actualización de Notion y sin iniciar Fase 3.**
