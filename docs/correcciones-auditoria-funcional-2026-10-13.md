# Correcciones posteriores a la auditoría funcional — 13 de octubre de 2026

## Resultado general

**COMPLETADO CON OBSERVACIONES.** AF-01 a AF-04 corregidos y con las suites
aprobadas. La revisión manual en navegador fue rechazada por la política de
seguridad del navegador integrado; las rutas se comprobaron mediante React con
el router real y HTTP real contra PostgreSQL aislado. AF-05 permanece fuera del
alcance. No se realizaron commits ni push.

## Estado inicial y alcance

Rama `main`, HEAD `a6eaa88262be622b5bb5a967415707a4b8b60733`, árbol inicial limpio.
Se contrastaron las causas de la auditoría con la implementación vigente. No se
cambiaron esquema, migraciones, permisos, dependencias, arquitectura ni diseño.
El backend de producción no requirió correcciones: los fallos de acceso eran
expectativas, proveedores y fixtures anteriores al contrato vigente.

## Hallazgos

| Hallazgo | Veredicto | Causa | Corrección |
| --- | --- | --- | --- |
| AF-01 | CORREGIDO | La ruta anidada usaba el parámetro de organización en secciones y estado de persona. | Se resuelve `nestedPersonId ?? routeId` una sola vez y se usa en consulta, contactos, vínculos, duplicados, historial, estado y claves de componentes. El contexto de organización conserva su identidad y retorno. |
| AF-02 | CORREGIDO | Pruebas públicas por token y proveedores retirados; fixtures incompatibles con la política actual; evento de perfil sin valores anterior/nuevo. | Suites actuales para contraseña inicial, cambio obligatorio y reset administrativo, fixtures válidos y pruebas de RBAC, revocación, rollback y concurrencia. Se conserva la cobertura de estructuras históricas con fixtures directos, sin reactivar emisión/consumo. |
| AF-03 | CORREGIDO | La demo creaba usuarios sin contraseña y consumía endpoints retirados; claves aleatorias sin garantía de política. | Creación con inicial, login restringido, cambio personal y login con la sesión rotada. Se validan identidad/rol/flag obligatorio y se guardan únicamente las contraseñas personales sintéticas. Se exige que el Administrador haya completado su cambio. |
| AF-04 | CORREGIDO | Aprovisionamiento LAN y guía de demo todavía indicaban tokens y pantallas retiradas; instrucciones de workspaces describían un bootstrap anterior. | Documentación de entrada oculta interactiva, login y cambio obligatorio; instrucciones API/web y estado de workspaces actualizados. Los antecedentes históricos permanecen identificados como tales. |

## Cobertura reemplazada y conservada

Las dos suites frontend de pantallas públicas retiradas se sustituyeron por
`change-password.test.tsx`; las pruebas de login y de Usuarios cubren el acceso
inicial y el restablecimiento administrativo vigentes. Las suites de integración
conservan sus nombres de archivo para continuidad, pero ejercitan el contrato
actual. No se añadieron `skip`, `only` ni proveedores retirados a AppModule.

| Intención anterior | Cobertura vigente equivalente |
| --- | --- |
| Emitir y consumir acceso temporal | Crear con contraseña inicial y cambiar obligatoriamente antes del acceso protegido. Endpoints públicos antiguos devuelven 404. |
| Política, Unicode y reutilización | 8–128 puntos de código NFC, mayúscula/minúscula/símbolo, límites, confirmación equivalente y rechazo de reutilización. Login mantiene su política propia. |
| Expiración, revocación y consumo único | Sesiones ausentes, inválidas, expiradas y revocadas; cambio repetido rechazado y una única operación ganadora en concurrencia. |
| Reset y regeneración | Reset administrativo repetido, revocación de todas las sesiones y credenciales históricas pendientes, cambio obligatorio posterior y auditoría sin secretos. |
| Sesión del navegador y protección de secretos | Redirección desde login inicial y rutas protegidas; contraseña borrada al enviar, solicitudes mínimas, confirmación no enviada, caché privada y logout, fallos y reintento. |
| Atomicidad y carreras | Relectura tras hash, hash/estado/flag obsoletos, rollback de escritura/sesiones/auditoría, cambios simultáneos, cambio versus reset/desactivación, último Administrador y cambios de rol vigentes. |
| Integridad histórica | Unicidad, FKs, restricciones de borrado, CHECKs temporales y de auditoría de estructuras heredadas, usando datos sintéticos directos. |

## Validaciones finales

| Validación | Suites | Aprobadas | Fallidas |
| --- | ---: | ---: | ---: |
| Frontend | 44 | 844 | 0 |
| API, unitarias y HTTP sin base de integración | 56 | 955 | 0 |
| Integración PostgreSQL/HTTP | 36 | 1218 | 0 |
| `yarn demo:test` | — | 8 | 0 |

`yarn lint`, `yarn typecheck` y `yarn build` aprobaron secuencialmente.
`yarn test` raíz también aprobó y confirmó las cantidades API/frontend anteriores.
Las integraciones se ejecutaron en ocho bases nuevas y desechables, con todas las
63 migraciones aplicadas. Se repitieron los grupos afectados tras corregir los
fixtures; los conteos usan la última ejecución de cada grupo, sin sumar reintentos.
Los errores HTTP 500 registrados por casos negativos de rollback son intencionales.

### Preparación real de demo

La integración ejecuta el preparador completo con API real escuchando en un
puerto local efímero y PostgreSQL `cecasem_demo_test`. Aprobó:

- Cinco cuentas sintéticas correspondientes a los cuatro roles, con contraseñas
  personales válidas y `mustChangePassword = false` al finalizar.
- Cero tokens de primer acceso/reset nuevos y cero sesiones vigentes al finalizar
  el preparador, antes del login posterior realizado por la prueba.
- Organizaciones, persona, contactos, intención convertida, comunicaciones,
  oportunidad, reunión y restricción de contacto.
- Cuatro importaciones confirmadas y procedencia preservada. Ocho snapshots
  comprueban que los previews no modifican el directorio.
- Repetición rechazada sin duplicar el dataset y autorización normal de Búsqueda.

Las protecciones de URL/puerto/base aislada se mantuvieron. Las credenciales y el
XLSX de la prueba se guardaron fuera de Git y se retiraron al finalizar.

### Persona directa y anidada

Dos regresiones con `AppRoutes` real comprueban `/people/:id` y
`/organizations/:id/people/:personId` con UUID distintos. Verifican los paths de
contactos, vínculos, duplicados e historial; la creación de contacto y vínculo,
edición de persona y cambio de estado; retorno contextual y claves de caché.
El mock representa además otra persona existente cuyo ID coincide con el de la
organización: cualquier consulta/escritura errónea queda registrada y falla.

La comprobación HTTP independiente realizó **18 solicitudes aprobadas** de
lectura/escritura sobre PostgreSQL real. Incluyó corrección de vínculo, edición de
persona y estado. Se creó otra persona con el ID de organización y se compararon
sus datos, contactos y vínculos antes/después: permanecieron intactos. HTTP por sí
solo no certifica el router; la evidencia se complementa con las dos regresiones
React y con las suites existentes de navegación/directorio.

## Observaciones restantes

- No se completó la comprobación manual en navegador: la política de seguridad
  rechazó vincular la pestaña existente. No se intentó eludir esa restricción.
- AF-05 sigue pendiente: build exitoso con chunk principal de 812,71 kB
  (gzip 222,16 kB), sin optimización en esta intervención.
- Persisten advertencias de deprecación de consultas del adaptador PostgreSQL
  y la advertencia experimental de VM Modules; no produjeron fallos.
- El procedimiento de despliegue LAN/Compose completo no se reejecutó. Se
  actualizaron los pasos de acceso según el CLI y servicios actuales; esta
  intervención no constituye una nueva certificación de despliegue.

## Limpieza y Git

Se retiraron las nueve bases desechables creadas para integraciones y HTTP. La
base original `cecasem_conecta` conserva su identidad y no fue modificada por los
ayudantes de prueba. Se detuvieron únicamente los procesos de API/Vite de QA
creados en esta intervención y se eliminaron sus credenciales sintéticas. Las
ventanas/pestañas de Codex no se cerraron.

`git diff --check` aprobado; diff revisado y adiciones inspeccionadas para secretos.
No se incorporan entornos reales, credenciales, logs, uploads, XLSX ni runtime.
HEAD permanece en `a6eaa88`; cambios locales pendientes de revisión, sin staging,
commit ni push.

## Archivos modificados o sustituidos

- `apps/api/AGENTS.md`
- `apps/api/README.md`
- `apps/api/src/modules/auth/authorization/authorization.spec.ts`
- `apps/api/src/modules/auth/first-access.spec.ts`
- `apps/api/src/modules/auth/password-reset.spec.ts`
- `apps/api/src/modules/auth/password.service.spec.ts`
- `apps/api/src/modules/auth/required-password-change.service.spec.ts`
- `apps/api/src/modules/users/users.service.spec.ts`
- `apps/api/test/access-fixture.ts`
- `apps/api/test/auth.integration-spec.ts`
- `apps/api/test/authorization.e2e-spec.ts`
- `apps/api/test/authorization.integration-spec.ts`
- `apps/api/test/demo-preparation.integration-spec.ts`
- `apps/api/test/first-access.integration-spec.ts`
- `apps/api/test/password-reset.integration-spec.ts`
- `apps/api/test/users-administration.integration-spec.ts`
- `apps/web/AGENTS.md`
- `apps/web/README.md`
- `apps/web/src/features/auth/auth.test.tsx`
- `apps/web/src/features/auth/change-password.test.tsx`
- `apps/web/src/features/auth/first-access.test.tsx` — retirado y sustituido por la suite vigente.
- `apps/web/src/features/auth/reset-password.test.tsx` — retirado y sustituido por la suite vigente.
- `apps/web/src/features/directory/person-context.test.tsx`
- `apps/web/src/features/directory/person-detail-page.tsx`
- `docs/correcciones-auditoria-funcional-2026-10-13.md`
- `docs/subfase-6.2-datos-demostracion.md`
- `docs/subfase-6.5-docker-produccion-lan.md`
- `scripts/demo/prepare-demo.d.mts`
- `scripts/demo/prepare-demo.mjs`
- `scripts/demo/prepare-demo.spec.mjs`

## Evidencia local de ejecución

Logs fuera del repositorio en `%TEMP%/cecasem-correcciones-20261013/`:
`integracion-resumen.json`, `conteos-finales.json`, `grupo-0..7-tests.log` y
`persona-http.json`. Los logs raíz están en `%TEMP%/cecasem-correcciones-*.log`.
No contienen contraseñas o cookies de las cuentas sintéticas. No se versionan.
