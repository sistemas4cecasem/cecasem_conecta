# Subfase 2.1 — Organizaciones

## Alcance implementado

Directorio institucional con organizaciones y sedes mediante `Organization.parentId`.
Nombre obligatorio; país textual, sigla/nombre alternativo, descripción y sitio
oficial opcionales. Campos desconocidos permanecen nulos. Categorías N:N sin
catálogo inicial, nombre con trim, espacios simples y unicidad por minúsculas
(conservando acentos). Estados activo/inactivo, sin endpoints de borrado.

Creación, modificación y última verificación son distintas. En 2.1 no existe
acción de verificación y `lastVerifiedAt` permanece nulo al crear y editar.
El sitio oficial no crea ni sincroniza medios de contacto futuros.

## Autorización efectivamente aplicada

| Capability | Administrador | Directorio | Búsqueda | Planificación |
| --- | --- | --- | --- | --- |
| directory.read | Sí | Sí | Sí | Sí |
| directory.write | Sí | Sí | Sí | Sí |
| directory.history.read | Sí | Sí | Sí | Sí |
| directory.status.update | Sí | No | No | No |

Consulta, creación, edición, matriz y categorías utilizan el catálogo existente,
SessionGuard, PermissionsGuard y RequirePermissions. El frontend consulta
capabilities, sin comparar roles. Los servicios revalidan al actor activo y su
permiso vigente dentro de la transacción.

La [matriz institucional](https://www.notion.so/3eb7a4f035ae8186a0f3dafd849aaba0)
sección 5 permite editar fichas para los cuatro roles y exige auditoría explícita.
La sección 13 condiciona archivar ficha/proceso fuera de Administrador; no define
una condición aplicable al estado de organizaciones/categorías en 2.1.
La descripción de Administrador sí respalda gestionar estados lógicos.
Por eso se aplica únicamente ese permiso inequívoco, corrigiendo la concesión
general propuesta en la planificación previa. No se inventan participantes de
procesos ni excepciones para ampliar privilegios.

## Integridad, historial y concurrencia

- UUID y FK RESTRICT para organizaciones, categorías, asociaciones, autores e
  historial. La asociación tiene clave primaria compuesta y no duplica pares.
- `DirectoryChange` está separado de `AuditEvent`. Cada campo conserva valores
  JSON tipados, objetivo con FK real, autor, fecha y UUID común de operación.
  CHECK exige exactamente un objetivo, campos permitidos, tipos y valores distintos.
- La auditoría explícita registra ORGANIZATION_UPDATED, CATEGORY_UPDATED y los
  respectivos cambios de estado; conserva objetivo concreto y operación común,
  sin payload arbitrario ni usuarios ficticios. Las nueve acciones de Fase 1
  conservan íntegramente sus constraints, incluido targetUserId obligatorio para
  esas familias.
- Edición y estado requieren `expectedVersion`. Un conflicto devuelve
  `409 VERSION_CONFLICT`; una edición efectiva incrementa versión y confirma
  ficha/asociaciones/historial/auditoría conjuntamente. Una petición sin cambios
  efectivos mantiene versión y no genera historia artificial.
- La jerarquía usa un advisory lock transaccional exclusivo del directorio
  (namespace 1128612692, clave 1), distinto del administrativo. Validación de
  ancestros y modificación ocurren dentro de esa sección protegida. También se
  bloquea la fila editada. Autorreferencia y ciclos indirectos se rechazan.
- Asignar nuevas categorías inactivas se rechaza. Asociaciones existentes se
  conservan y pueden mantenerse durante una edición; retirarlas es explícito.
  Bloqueos de categorías ordenados protegen la comprobación frente a desactivación.
- Historial paginado muestra valores y nombres actuales de fichas referenciadas;
  los identificadores originales permanecen en los valores almacenados y API.
  No se implementa aún el historial completo de otras entidades de 2.4.

## Contratos HTTP

Base `/api/v1`. Lecturas autenticadas con Cache-Control: no-store.

| Método y ruta | Operación |
| --- | --- |
| GET /organizations | Lista paginada |
| GET /organizations/:id | Ficha institucional |
| POST /organizations | Crear |
| PUT /organizations/:id | Reemplazar campos ordinarios, matriz y categorías |
| PATCH /organizations/:id/status | Estado con permiso específico |
| GET /organizations/:id/children | Sedes paginadas |
| GET /organizations/:id/history | Historial mínimo paginado |
| GET /categories | Catálogo paginado |
| POST /categories | Crear categoría |
| PUT /categories/:id | Renombrar con versión |
| PATCH /categories/:id/status | Estado con permiso específico |
| GET /categories/:id/history | Historial mínimo de categoría |

PUT exige nombre y expectedVersion; los campos opcionales omitidos se vacían
y categoryIds omitido equivale a lista vacía. La interfaz envía la ficha completa.
Los campos administrativos, fechas y verificación no son aceptados como entrada.

Listados admiten page (predeterminado 1), pageSize (25, máximo 100),
status (active/inactive/all) y filtro name. Organizaciones admite además parentId.
Orden por nombre e ID; historial por fecha e ID. Las páginas incluyen
items, total, page y pageSize. El historial añade referencias de nombres para
presentación, sin alterar valores históricos.

Errores públicos seguros: 400 validación; 401 sin sesión; 403 sin permiso;
404 objeto ausente; 409 VERSION_CONFLICT, INVALID_HIERARCHY,
CATEGORY_EXISTS o CATEGORY_INACTIVE. No se exponen errores Prisma ni stacks.

## Interfaz

`/organizations`, `/organizations/new`, `/organizations/:id` y
`/organizations/categories`. Navegación autenticada Directorio, listas y
selectores paginados, formularios React Hook Form/Zod, ficha, sedes, catálogo,
historial, estados pendientes/errores/vacíos y estilos responsive.

TanStack Query conserva datos del servidor en claves propias con identidad.
Las mutaciones invalidan el directorio de esa identidad. Logout cancela y limpia
la caché; cambios de identidad/capabilities cancelan y retiran consultas ajenas.
Ante conflicto, el formulario conserva el borrador, no reenvía automáticamente
y ofrece recargar con advertencia explícita de descarte.

## Migraciones y verificación reproducible

Se mantienen intactas las seis migraciones de Fase 1 y se agregan:

1. `20261002164854_organization_directory`: enum, modelos, FK e índices.
2. `20261002170000_directory_constraints`: CHECK de dominio e infraestructura;
   utiliza los nuevos valores del enum una vez confirmada la primera migración.

Antes de Fase 2 se reconstruyeron las imágenes del HEAD inicial
`83dc164ca7efc41f0f833c203a60369bb0ed54a5`, se desplegaron las seis
migraciones existentes y se recrearon api/web sin eliminar datos ni volúmenes.
Se comprobó health 200, users/email-accounts 401 anónimos y frontend del HEAD.
Posteriormente se desplegaron las dos migraciones de 2.1 con migrate deploy.

Para comprobar limpia y upgrade, proporcionar DATABASE_URL de PostgreSQL local
aislado terminado en _test y ejecutar:

```text
node infra/development/validate-directory-migrations.cjs
```

El script crea dos bases temporales exclusivas, comprueba ocho migraciones
desde cero y upgrade de seis a ocho con datos de las siete tablas de Fase 1.
Compara valores previos y posteriores, incluidos credenciales, sesiones, tokens,
asociaciones y auditoría. Elimina únicamente las bases y staging que él creó.
No utiliza db push ni reinicia bases existentes.

Pruebas: reglas y DTO del directorio; PostgreSQL/HTTP con permisos, FK, N:N,
historial, rollback, CHECK y barreras deterministas para versiones/ciclos;
frontend con fichas, matriz, multiselección, paginación, errores, conflictos,
invalidación, logout y nombres de asociaciones.

No hay cambios de dependencias, seeds institucionales ficticios ni entidades de 2.2+.
