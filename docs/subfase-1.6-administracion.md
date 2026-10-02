# Administración mínima — Subfase 1.6

La administración de identidad está en `/users`. No hay autorregistro, edición
general de perfiles, eliminación de usuarios, envío de correo ni sincronización.
No se almacenan credenciales de proveedores externos.

## Permisos y contratos

| Capability | Administrador | Directorio | Búsqueda | Planificación |
|---|---|---|---|---|
| auth.first_access.issue | Sí | — | — | — |
| auth.password_reset.issue | Sí | — | — | — |
| users.read | Sí | Sí | — | — |
| users.deactivated.read | Sí | — | — | — |
| users.create | Sí | — | — | — |
| users.role.update | Sí | — | — | — |
| users.status.update | Sí | — | — | — |
| users.mailboxes.manage | Sí | — | — | — |

Son concesiones explícitas del mapa backend. El frontend usa las capabilities
recibidas en login/me y no replica este mapa.

| Método/ruta bajo `/api/v1` | Capability | Resultado |
|---|---|---|
| GET users | users.read | 200, activos por defecto |
| GET users?status=inactive/all | users.read + users.deactivated.read | 200 |
| POST users | users.create | 201, cuenta pendiente |
| PATCH users/:id/role | users.role.update | 204 |
| POST users/:id/deactivate | users.status.update | 204 |
| POST users/:id/reactivate | users.status.update | 204 |
| GET email-accounts | users.mailboxes.manage | 200, catálogo activo |
| POST email-accounts | users.mailboxes.manage | 201 |
| GET users/:id/email-accounts | users.mailboxes.manage | 200, asignaciones vigentes |
| PUT users/:id/email-accounts/:emailAccountId | users.mailboxes.manage | 204 |
| DELETE users/:id/email-accounts/:emailAccountId | users.mailboxes.manage | 204, retiro lógico |
| POST auth/first-access-tokens | auth.first_access.issue | 201, credencial efímera |
| POST auth/password-reset-tokens | auth.password_reset.issue | 201, credencial efímera |

Usuarios ordenados por apellidos, nombres e id. Sin paginación, búsqueda ni otros
filtros. Directorio no lee inactivos; la comprobación precede a su consulta.

Crear usuario admite únicamente `givenNames`, `familyNames`, `email`, `role`.
El username sigue automático; nombres/correo se normalizan. Los campos adicionales
se rechazan. No se emite token al crear: esto conserva el TTL para la entrega real.
El DTO administrativo expone id, nombres, apellidos, username, correo, rol, estado,
createdAt, deactivatedAt y credentialStatus; nunca hashes ni tokens.

`PENDING_FIRST_ACCESS` deriva de passwordHash nulo; `ESTABLISHED` de un hash
existente. Un reset pendiente no modifica credentialStatus.

Errores: 400 entrada inválida, 401 sesión inválida, 403 falta de permiso,
404 identidad/buzón inexistente y 409 conflicto. Los conflictos administrativos
incluyen códigos públicos `LAST_ADMINISTRATOR`, `EMAIL_EXISTS`, `ACCOUNT_EXISTS`,
`ACCOUNT_INACTIVE`, `USERNAME_EXHAUSTED`; sin SQL ni stack traces.

## Transacciones, último Administrador y auditoría

Una instalación con Administradores activos no puede quedar con cero mediante
operaciones normales. Autocambio y autodesactivación son posibles con otro Admin.
El conflicto muestra «Debe permanecer al menos un Administrador activo».

La coordinación adquiere `pg_advisory_xact_lock(1128612691, 1)` antes de los locks
de User, siempre por UUID en orden ascendente. La clave estable está documentada
en UsersService y compartida con el bootstrap. Al reducir el conjunto activo se
relee el target, se cuenta y se protege el último Admin dentro de la transacción.
La baja escala permite coordinar las mutaciones administrativas con esa misma
clave. La emisión bloquea actor y destinatario en el mismo orden. El actor vigente
se revalida bajo locks; una degradación/desactivación no pasa desapercibida.

Users conserva creación, roles y asociaciones; Auth conserva sesiones y
UserAccessService; Audit escribe sus eventos. UsersAdministrationModule compone
esos módulos sin dependencia Users → Auth ni forwardRef.

Cambiar rol conserva sesiones: la siguiente petición refleja permisos actuales.
Desactivar conserva identidad, contraseña e historial; revoca sesiones y tokens
pendientes, registra cada reset revocado y USER_DEACTIVATED. Reactivar no revive
sesiones/tokens y registra USER_REACTIVATED. Las transiciones repetidas no inventan
auditoría; un usuario inexistente siempre produce 404.

Las asociaciones conservan la PK compuesta y createdAt original. Retirar marca
removedAt; reasignar lo limpia. El CHECK exige fecha de retiro >= creación.
Los usuarios inactivos pueden conservar/recibir asignaciones. Un buzón inactivo
no puede asignarse. Las acciones idempotentes no repiten eventos.

AuditEvent añade únicamente previousRole, newRole y emailAccountId, este último
con FK RESTRICT e índice. USER_ROLE_CHANGED exige roles distintos; eventos de
estado no llevan roles/reset/buzón; MAILBOX_ASSIGNED/REMOVED exigen buzón. Todos
requieren actor y target. Los cuatro eventos de reset conservan exactamente sus
invariantes anteriores. El CHECK rechaza cruces entre familias. Si la auditoría
falla, negocio y auditoría hacen rollback juntos.

## Aprovisionamiento inicial offline

Antes de ejecutar, aplica las migraciones y configura DATABASE_URL en el entorno.
No existe `/setup`, `/bootstrap` ni otro endpoint de aprovisionamiento.

Desde el repositorio, en una terminal privada del operador:

```powershell
yarn workspace @cecasem-conecta/api bootstrap:admin --given-names "Nombres" --family-names "Apellidos" --email "administrador@example.test"
```

Con el contenedor API ya construido y migrado:

```powershell
docker compose exec api node dist/bootstrap-admin.js --given-names "Nombres" --family-names "Apellidos" --email "administrador@example.test"
```

Sustituye únicamente los datos de identidad. **El comando no acepta contraseña,
username, rol ni token**. No cambies datos iniciales para evadir estas condiciones:

- Cero usuarios: crea un único Administrador activo y un FirstAccessToken estándar.
- Un único Admin activo con passwordHash nulo: permite regenerar para el mismo
  correo, revocando la credencial previa y conservando identidad.
- Más de un usuario, usuario inactivo, otro rol o contraseña establecida: rechaza.
  Nunca funciona como recuperación de emergencia.

La identidad y el token se crean en una transacción. Un try-lock de la misma clave
rechaza otro proceso simultáneo. El emisor nulo representa solo este procedimiento
offline; HTTP continúa exigiendo actor autenticado y emisor no nulo.

La salida interactiva única contiene id, username, correo, token, caducidad y
`/first-access#token=...`. No redirijas ni guardes esta salida en logs/archivos.
Entrega el enlace por un canal verificado. El Administrador establece personalmente
su contraseña mediante primer acceso; Argon2id y caducidad/uso único permanecen.
Si pierde la credencial antes de completar el estado inicial, repite el comando.

## Interfaz y caché

Admin puede consultar los tres estados y realizar cada acción según su capability;
Directorio solo consulta activos. Búsqueda/Planificación reciben acceso denegado
al entrar manualmente, sin consulta administrativa ni logout automático.

Los formularios usan React Hook Form/Zod. Crear cuenta y emitir acceso son pasos
separados. La credencial solo existe en estado local: cerrar o desmontar la elimina,
una respuesta tardía no la repone. No pasa por cachés de query/mutación, storage ni
URL administrativa. Se puede copiar un enlace con fragmento para entrega verificada.

Las keys incluyen identidad (`users, actorId, status`; `email-accounts, actorId`;
`users, actorId, targetId, email-accounts`). Un cambio propio de rol refresca me y
cancela/retira consultas no autorizadas. La nueva identidad desmonta controles.
Una autodesactivación limpia datos privados y vuelve a login. Un 403 conserva
sesión y permite un refetch acotado de me; un 401 invalida identidad.

## Migraciones y validación

- `20261002110000_administration_audit_actions`: extensión de enum.
- `20261002110001_minimal_administration`: columnas, FK/índice y CHECK en transacción.

El split permite utilizar valores de enum después de su commit. Las cuatro
migraciones anteriores se mantienen intactas. No se requiere dependencia nueva.
La integración se ejecuta solo sobre bases cuyo nombre termine en `_test`, con
fixtures propios y limpieza por UUID; nunca resetear el runtime.

```powershell
yarn lint
yarn typecheck
yarn test
yarn build
yarn workspace @cecasem-conecta/api test:e2e
yarn workspace @cecasem-conecta/api test:integration
yarn workspace @cecasem-conecta/api prisma:validate
yarn workspace @cecasem-conecta/api prisma:migrate:status
git diff --check
```

test:e2e incluye todas las suites `e2e-spec`, no solo app.e2e. La integración prueba
RBAC HTTP, actor vigente, transiciones, audit rollback, CHECK y locks con barreras
deterministas; los tests frontend cubren restricciones, formularios y caché.
También validar migración limpia/upgrade con resets existentes, Docker/health,
bootstrap real y el flujo completo de aceptación en navegador con fixtures.

## Alcance no funcional

RNF-01: Argon2id, sin password plano persistido. RNF-02: guards y revalidación
backend. RNF-03: credenciales temporales con hash, caducidad y uso único.
RNF-04: no aplicable aún, sin adjuntos en Fase 1. RNF-05: DTO/Zod y validación
autoritativa backend. RNF-06: HTTP local/LAN controlado; HTTPS obligatorio antes
de exposición a Internet. Esta subfase no añade TLS ni funcionalidades de Fase 2.
