# Subfase 4.4 — Reuniones institucionales

## Baseline y alcance

Trabajo sobre `main`, HEAD `926d1c58f9f88cce9b44dc88e10eed8a2d091934`. Al iniciar existían 38 archivos con cambios de 4.3 sin commit: 22 modificados y 16 nuevos. Se conservó una referencia exacta de esos archivos para revisar el incremento de 4.4; las dos migraciones de 4.3 y sus implementaciones propias permanecen intactas. No se creó commit, no se hizo push ni se inició otra subfase.

Esta entrega incorpora reuniones dentro del monolito modular, reutilizando sesiones, autorización, Directorio, procesos, oportunidades, auditoría, timeline y archivos privados. No agrega dependencias, configuración productiva, proveedores de almacenamiento ni infraestructura. No cambia estados de oportunidades ni cierra/reabre procesos automáticamente.

## Modelo e invariantes

`Meeting` conserva ID opaco, proceso y/o oportunidad, instante programado, zona horaria, modalidad, enlace/lugar opcionales, propósito, estado, autor y fechas de registro. Incluye versión y datos del comando idempotente. Al menos un origen es obligatorio. Si ambos vínculos existen y la oportunidad tiene proceso, este debe coincidir. Una oportunidad con proceso también puede tener una reunión vinculada solo a ella; no se inventa un segundo vínculo.

Los orígenes, creador y datos del comando inicial son inmutables. Estados:

| Estado | Planificación | Participantes | Asistencia/acuerdos | Documentos |
| --- | --- | --- | --- | --- |
| Programada (`SCHEDULED`) | Editable si la hora original y nueva siguen siendo futuras | Incorporación permitida | Primero debe registrarse realizada; nunca antes de la hora programada | Carga/consulta/descarga |
| Realizada (`COMPLETED`) | Conservada | Incorporación posterior trazable | Registro explícito y acuerdos nuevos | Carga/consulta/descarga |
| Cancelada (`CANCELLED`) | Conservada | Conservados, sin incorporaciones nuevas | Sin resultados nuevos | Consulta/descarga de anteriores; nueva carga bloqueada |

Cancelar una reunión programada exige motivo. Los reintentos de una carga ya confirmada siguen devolviendo el resultado previo aunque luego se cancele. No hay eliminación física en las interfaces de negocio.

Se pueden registrar reuniones históricas como programadas y consolidarlas explícitamente. La creación no presupone asistencia, acuerdos ni realización. No hay reapertura de reuniones realizadas/canceladas en esta entrega.

## Fecha, hora y zona horaria

Entrada: `scheduledLocal` en formato `YYYY-MM-DDTHH:mm`, más `timezone` IANA explícita, por ejemplo `America/La_Paz`. El backend usa `Intl.DateTimeFormat` con zona explícita para resolver la hora de pared. PostgreSQL almacena el instante en `timestamptz(3)` y conserva la zona original por separado. La respuesta incluye el instante UTC y la hora local reconstruida.

Nunca se deduce la zona del navegador o servidor. La interfaz muestra fecha/hora en la zona de la reunión, incluida la etiqueta de zona. La zona inicial del formulario es `America/La_Paz`; puede cambiarse por otra zona nombrada válida, incluido `UTC`. Se rechazan zonas inexistentes y desplazamientos numéricos sin nombre.

Una hora inexistente por DST se rechaza. Una hora repetida exige elegir `earlier` o `later`; no se elige silenciosamente. Se prueban cambios de una hora, media hora y el salto de un día de Pacific/Apia. El formulario ofrece primera/segunda ocurrencia y muestra errores en español. El trigger final de PostgreSQL resuelve la zona directamente, evitando enumerar todas las zonas por cada fila.

## Participantes y asistencia

`MeetingParticipant` diferencia usuarios internos (`userId`), personas externas existentes (`personId`) y referencias textuales sin ficha. Usuario y persona no pueden coexistir en una misma incorporación. No se crean fichas Person para completar datos desconocidos.

El selector interno reutiliza la interfaz pública del módulo Users: usuarios activos, IDs y nombres, con búsqueda/paginación. No expone contraseñas, tokens, correos ni administración. El selector externo reutiliza la búsqueda de Directorio y sus páginas; permite referencias históricas inactivas, excluye fichas consolidadas y revalida dentro de la transacción.

Se conserva nombre, organización y cargo conocidos como snapshots. Para usuarios internos, el nombre se obtiene de la identidad real; no puede suplantarse mediante texto enviado por el cliente. Para personas existentes, si no se proporciona nombre mencionado, se copia el nombre de la ficha. Los cambios posteriores del Directorio no reescriben estas identificaciones.

Una reunión no puede repetir el mismo usuario o Person. Coincidencias de nombres textuales no producen fusiones automáticas. La asistencia inicial es `UNKNOWN`; `ATTENDED` o `ABSENT` requieren una acción explícita después de registrar realizada. Cada corrección de asistencia conserva valor anterior/nuevo, actor y fecha en un evento.

## Acuerdos, historial y auditoría

`MeetingAgreement` es append-only: texto, reunión, autor y fecha. No existen endpoints de edición o borrado. Aclaraciones se agregan como acuerdos posteriores. Un trigger impide UPDATE de acuerdos y eventos históricos; las referencias usan FK restrictivas.

`MeetingEvent` registra `CREATED`, `UPDATED`, `COMPLETED`, `CANCELLED`, `PARTICIPANT_ADDED`, `ATTENDANCE_RECORDED` y `AGREEMENT_ADDED`. Conserva versión, snapshot de planificación, participantes contados, oportunidad conocida, cambios, actor, fecha, clave y fingerprint. Los vínculos a participante/acuerdo deben pertenecer a la misma reunión. El historial de la reunión se pagina por versión; el timeline institucional usa su cursor cronológico estable.

Se agregó una sola acción de auditoría, `MEETING_RECORDED`, asociada de forma única al evento. El tipo específico vive en el historial de negocio. Evento, auditoría, reunión, resultados y efectos en el proceso se confirman en la misma transacción. Constraints/triggers verifican identidad del actor, operación y forma de los datos. Los fallos revierten todo el comando.

Los archivos conservan su auditoría `FILES_ATTACHED` y su historial de incorporación existente; no generan versiones ficticias de Meeting ni actividad del proceso por leer o adjuntar.

## Participación formal y actividad del proceso

Crear una reunión vinculada a proceso otorga participación formal al registrador mediante `ProcessParticipationService`, con origen `MEETING_CREATED`. Invitar a un usuario interno no lo convierte automáticamente en participante formal del proceso.

| Actuación | Participación del actor | `lastActivityAt` / versión del proceso |
| --- | --- | --- |
| Crear reunión futura | Se asegura | Sin cambio |
| Editar planificación futura, invitar antes de realización o cancelar | No se agrega por estos comandos | Sin cambio |
| Crear reunión histórica | Se asegura | Avanza monotónicamente al registro formal |
| Registrar realizada, asistencia, acuerdo o incorporación posterior a realizada | Se asegura | Avanza monotónicamente al registro formal |
| Consultar, descargar o cargar archivos | Sin cambio | Sin cambio |

Se reutiliza la interfaz de actividad del propietario Relationships, bajo su lock. Se conservan estado y resultado de cierre del proceso, incluso ante un cierre concurrente. Una reunión solo vinculada a oportunidad no modifica un proceso por asociación indirecta.

## Autorización efectiva

| Capacidad | Administrador | Directorio | Búsqueda | Planificación |
| --- | --- | --- | --- | --- |
| Consultar (`meetings.read`) | Sí | Sí | Sí | Sí |
| Crear (`meetings.create`) | Sí | Sí | Sí | Sí |
| Planificación/cancelación (`meetings.update`) | Sí | Sí | Sí | Sí |
| Incorporar participantes (`meetings.participants`) | Sí | Sí | Sí | Sí |
| Realización/asistencia/acuerdos (`meetings.results`) | Sí | Sí | Sí | Sí |
| Archivos (`files.read` / `files.upload`) | Sí | Sí | Sí | Sí |

Siempre se exige sesión vigente, usuario activo y acceso al proceso/oportunidad vinculados. No se agrega restricción de propietario para reuniones. La visibilidad del frontend no sustituye autorización backend.

El timeline tampoco expone eventos ni nombres de archivos de reuniones cuando falta acceso a reuniones o a su oportunidad. Sus consultas filtran antes de paginar. Las cachés incluyen usuario, rol y permisos relevantes; se cancelan/retiran cuando cambia identidad o contexto. Las respuestas tardías de comandos/consultas de reuniones se vuelven a comprobar antes de incorporarse.

## Idempotencia y concurrencia

Cada comando exige `Idempotency-Key` UUID. La unicidad es por actor y clave en `MeetingEvent`; el fingerprint incluye acción, recurso, payload y versión esperada. Un reintento idéntico devuelve el resultado confirmado sin repetir eventos, acuerdos, participantes ni auditoría. Reusar una clave con otro comando produce 409.

Los comandos posteriores usan `expectedVersion`. Locks de identidad ordenados, lock de Meeting y locks de sus contextos serializan operaciones. El reintento se comprueba antes de aplicar la versión/estado actuales. Una edición concurrente o completar/cancelar en paralelo tiene un solo ganador; el otro recibe conflicto. La interfaz conserva el borrador, ofrece recarga/revisión y cambia la clave cuando cambia el comando.

La carga de archivos reutiliza staging, validación de tipos, fingerprints, compensación y almacenamiento de 4.1. Revalida permisos/estado bajo lock de reunión antes de confirmar, incluso si se canceló durante el multipart. Los bytes permanecen en volumen privado, no en blobs PostgreSQL ni URLs estáticas públicas. Se mantiene el límite configurado inicial de 20 MiB y hasta diez archivos por lote.

## API real

Base: `/api/v1`. Mutaciones de reuniones devuelven Meeting; páginas usan `page`/`pageSize` (25 por defecto, máximo 100).

| Método | Ruta | Operación |
| --- | --- | --- |
| GET / POST | `/meetings` | Listar / crear |
| GET | `/meetings/internal-users` | Equipo interno disponible, paginado y filtrable |
| GET / PATCH | `/meetings/:id` | Ficha / reemplazar planificación futura |
| POST | `/meetings/:id/complete` | Registrar realizada |
| POST | `/meetings/:id/cancel` | Cancelar con motivo |
| GET / POST | `/meetings/:id/participants` | Página / incorporar |
| PATCH | `/meetings/:id/participants/:participantId/attendance` | Asistencia explícita |
| GET / POST | `/meetings/:id/agreements` | Página / agregar acuerdo |
| GET | `/meetings/:id/events` | Historial paginado |
| GET / POST | `/meetings/:id/attachments` | Página / carga privada existente |
| GET | `/files/:id` y `/files/:id/download` | Metadatos / descarga autorizada existente |

PATCH de planificación recibe todos los campos requeridos de planificación, más versión; no recibe ni modifica orígenes. El listado filtra `processId`, `opportunityId` y estado. Errores seguros: 400 para datos/zonas/orígenes inválidos, 401 para sesión inválida, 403 para permisos, 404 para reunión inexistente y 409 para conflictos de versión, estado, referencias o comando.

## Frontend y E2E

Rutas `/meetings`, `/meetings/new` y `/meetings/:id`, navegación Reuniones y listados vinculados en ficha de proceso y oportunidad. Formularios con React Hook Form, planificación validada con Zod y estado servidor con TanStack Query. Se muestran carga/error/vacío, paginación, errores de conflicto, borradores preservados, identidades, asistencia, acuerdos y adjuntos.

Verificación real en Docker aislado:

1. Búsqueda abrió un proceso creado por otro usuario y programó para una hora futura en America/La_Paz, con oportunidad coherente.
2. Incorporó usuario interno, Person existente y participante textual; el total de Person siguió siendo uno. No se marcó asistencia automática.
3. Subió un documento por la interfaz; descarga autorizada 200 y anónima 401. Se confirmó participación `MEETING_CREATED`, con actividad, versión y estados originales sin cambios.
4. Transcurrió naturalmente la hora programada, sin manipular reloj de producción. Otro usuario, Planificación, registró realizada, asistencia y acuerdo en la misma reunión.
5. El timeline conserva programación, participantes, documentación y resultados; la actividad del proceso avanzó sin cambiar su estado ni el de la oportunidad.
6. Se comprobó una reunión solo desde oportunidad, actualizaciones concurrentes 200/409, zona inválida 400, carga después de realizada 201, nueva carga tras cancelar 409 y descarga histórica tras cancelar 200.
7. Se revisó móvil con viewport 390×844: ancho útil y ancho de contenido iguales (375 px), sin desbordamiento horizontal. Capturas de escritorio y móvil se guardaron fuera del repositorio.

Las credenciales/fixtures de QA son sintéticas y permanecen fuera del diff. Se desactivaron sus cuatro usuarios, se revocaron las sesiones y se retiraron los hashes de acceso. Se detuvo únicamente el proyecto Docker de auditoría, conservando sus volúmenes; los contenedores previos del usuario siguieron activos. Al cerrar la pestaña temporal de QA, el usuario informó que también se cerró Codex. Se suspendieron otros cierres de pestañas/ventanas y se continuó el cierre documental del trabajo.

## Frontera para 4.5

`MeetingsService.recordedActivity(after, limit)` proporciona una página acotada (máximo 100) de hechos confirmados: ID de evento, reunión, tipo, actor y fecha, con siguiente posición. No es un endpoint público ni expone contenidos privados completos.

No hay dependencia de Notifications en Meetings, envío de avisos, consumidores nuevos, recordatorios, correo ni integraciones de calendario. Los hechos quedan disponibles para que 4.5 P1 determine su consumo y política posteriormente. El consumidor de oportunidades P0 existente se conserva.

## Migraciones

Se conservan 43 migraciones anteriores; se agregan cuatro, en orden:

- `20261005030000_meeting_actions`: enum de auditoría y origen de participación, en transacción separada.
- `20261005030001_meetings`: tablas, enums, FK, índices, unicidad de comandos/participantes/versiones, vínculo de archivos y triggers de historia/coherencia.
- `20261005030002_meeting_integrity`: requisitos explícitos de no-null para completado/cancelación y objetos JSON de eventos.
- `20261005030003_meeting_timezone_lookup`: resolución directa de zona en el trigger, sin enumeración por fila.

Las 47 se desplegaron desde cero en PostgreSQL 18 con rol `cecasem`, `rolsuper=false`. `migrate status` está actualizado, `Prisma validate` pasó y `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` no detectó diferencias. La cadena final desde cero no necesita correcciones manuales.

## Pruebas y validaciones

La ejecución final pasó completa: 779 pruebas API en 44 suites, 543 frontend en 29 suites y 1137 de integración PostgreSQL/HTTP en 28 suites. Las 94 pruebas propias de 4.4 están incluidas en esos conteos, no se suman nuevamente.

| Validación ejecutada con Corepack/Yarn 4 | Resultado |
| --- | --- |
| `yarn lint` | Pasó |
| `yarn typecheck` | Pasó |
| `VITEST_MAX_WORKERS=1 yarn test` | Pasó: API 779 y frontend 543 |
| `yarn workspace @cecasem-conecta/api test:integration` | Pasó: 1137, base dedicada `_test` |
| Pruebas frontend específicas de reuniones | Pasaron; incluidas en la regresión completa |
| `yarn workspace @cecasem-conecta/api prisma:validate` | Schema válido |
| `prisma:migrate:deploy` / `prisma:migrate:status` | 47 aplicadas desde cero; estado actualizado |
| `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | Sin diferencias |
| `yarn build` | API/web compiladas |
| Docker Compose `config --quiet`, `build api web`, `up -d api web --wait` | Configuración válida, imágenes construidas, servicios saludables |
| E2E navegador / HTTP, escritorio y móvil | Flujo e invariantes comprobados |
| `git diff --check` y comprobación de nuevos archivos | Sin errores de whitespace |

La cadena definitiva de migraciones se comprobó también en una segunda base vacía del mismo entorno de auditoría, después de normalizar finales de archivo. Las 43 migraciones anteriores siguen intactas. No hay cambios de schema fuera de las migraciones.

Cobertura propia: 39 casos unitarios de reuniones (zona/DST, fechas, modalidades, vínculos, participantes, estados, versiones y fingerprint); 34 casos PostgreSQL/HTTP (cuatro roles, idempotencia, carreras, rollback, FK/triggers, trazabilidad, privacidad, archivos, actividad, listados/timeline con mil reuniones); 21 frontend (listado/filtros/páginas, creación, zona, detalle, participantes, resultados, archivos, cancelación, errores, 409 y caché).

No se cambiaron timeouts globales. Vitest se ejecutó con `VITEST_MAX_WORKERS=1`, permitido por el prompt. Avisos no bloqueantes observados: VM Modules experimental de Jest, deprecación de llamadas concurrentes del adaptador pg y chunk principal Vite superior a 500 kB. Los errores 500 provocados por tests de rollback/compensación son parte de esos casos; no se presentan como fallos de la verificación final.

## Decisiones de implementación

- Tres estados explícitos separan planificación, resultados y cancelación sin agregar flujos futuros.
- La zona se resuelve con Intl/IANA existente; DST ambiguo requiere elección humana.
- Participantes se incorporan tras guardar la reunión; el origen no puede cambiarse.
- Programación futura da participación al registrador sin simular interacción ocurrida. Los resultados formales posteriores avanzan actividad monotónicamente.
- Se usa una acción auditada general con eventos de negocio específicos; no se multiplica el enum de auditoría por cada formulario.
- El historial de Meeting ordena por versión y el timeline institucional mantiene su cursor propio compatible.
- Se reutiliza el selector de Directorio con descripción contextual de reunión y los archivos existentes, conservando funcionalidades previas.

## Estado final

Subfase 4.4 completada con observaciones no bloqueantes de herramientas y baseline: Vitest con un worker, avisos descritos arriba y cambios previos 4.3 sin commit. No quedan criterios funcionales de 4.4 pendientes. La incidencia de cierre de la aplicación reportada por el usuario no se presenta como resuelta; no se efectuaron otros cierres de UI.

El diff y los archivos nuevos se revisaron sin secretos, entornos reales, archivos subidos, respaldos ni datos de runtime. El incremento tiene 57 archivos; el estado acumulado tiene 42 modificados y 35 nuevos frente a HEAD. Índice vacío, `git diff --check` limpio, HEAD sin cambios. NO COMMIT / NO PUSH. Repositorio listo para definir e implementar 4.5 P1 en una tarea posterior, sin iniciarla aquí.

## Inventario del incremento

4.4 modifica 38 archivos existentes y agrega 19: cuatro migraciones, ocho archivos de módulo backend, una suite de integración, cinco archivos frontend y este documento. Total 57 archivos del incremento. El estado acumulado frente a HEAD tiene 77 archivos por los 38 previos de 4.3; 18 de esos previos son compartidos con el incremento. Los otros 20 permanecen sin cambios de bytes respecto del baseline.

Grupos: Prisma/migraciones; módulo Meetings; fronteras Users/Relationships/Opportunities/Audit; autorización; archivos/timeline; suites backend; feature frontend Meetings; navegación/cachés; integración en fichas de proceso/oportunidad; contratos y mensajes seguros.

El listado exacto de archivos de 4.4 se incluye a continuación. Los módulos propios Referrals, sus tests/documentación y migraciones de 4.3 no forman parte de este incremento.

```text
apps/api/prisma/schema.prisma
apps/api/src/app.module.ts
apps/api/src/modules/audit/audit.service.ts
apps/api/src/modules/auth/authorization/authorization.spec.ts
apps/api/src/modules/auth/authorization/permission.ts
apps/api/src/modules/auth/authorization/role-permissions.ts
apps/api/src/modules/files/file-error.filter.ts
apps/api/src/modules/files/file-errors.ts
apps/api/src/modules/files/file-upload.interceptor.ts
apps/api/src/modules/files/files.controller.ts
apps/api/src/modules/files/files.dto.ts
apps/api/src/modules/files/files.module.ts
apps/api/src/modules/files/files.service.ts
apps/api/src/modules/opportunities/opportunities.service.ts
apps/api/src/modules/relationships/relationship-processes.service.ts
apps/api/src/modules/relationships/relationship-timeline.module.ts
apps/api/src/modules/relationships/relationship-timeline.service.ts
apps/api/src/modules/relationships/timeline.dto.ts
apps/api/src/modules/relationships/timeline.rules.ts
apps/api/src/modules/users/users.service.ts
apps/api/test/communication-amendments.integration-spec.ts
apps/api/test/files.integration-spec.ts
apps/api/test/password-reset.integration-spec.ts
apps/api/test/relationship-timeline.integration-spec.ts
apps/web/src/app/layout/authenticated-layout.tsx
apps/web/src/app/router/app-routes.tsx
apps/web/src/app/router/navigation.ts
apps/web/src/features/directory/target-picker.tsx
apps/web/src/features/files/attachments.tsx
apps/web/src/features/files/contracts.ts
apps/web/src/features/files/queries.ts
apps/web/src/features/opportunities/opportunities-pages.tsx
apps/web/src/features/relationships/process-contracts.ts
apps/web/src/features/relationships/relationship-process-detail-page.tsx
apps/web/src/features/relationships/relationship-timeline.tsx
apps/web/src/features/relationships/timeline-contracts.ts
apps/web/src/features/relationships/timeline-queries.ts
apps/web/src/lib/api/client.ts
apps/api/prisma/migrations/20261005030000_meeting_actions/migration.sql
apps/api/prisma/migrations/20261005030001_meetings/migration.sql
apps/api/prisma/migrations/20261005030002_meeting_integrity/migration.sql
apps/api/prisma/migrations/20261005030003_meeting_timezone_lookup/migration.sql
apps/api/src/modules/meetings/meeting-clock.ts
apps/api/src/modules/meetings/meeting-error.filter.ts
apps/api/src/modules/meetings/meeting.dto.ts
apps/api/src/modules/meetings/meeting.rules.spec.ts
apps/api/src/modules/meetings/meeting.rules.ts
apps/api/src/modules/meetings/meetings.controller.ts
apps/api/src/modules/meetings/meetings.module.ts
apps/api/src/modules/meetings/meetings.service.ts
apps/api/test/meetings.integration-spec.ts
apps/web/src/features/meetings/contracts.ts
apps/web/src/features/meetings/meeting-components.tsx
apps/web/src/features/meetings/meetings-pages.test.tsx
apps/web/src/features/meetings/meetings-pages.tsx
apps/web/src/features/meetings/queries.ts
docs/subfase-4.4-reuniones.md
```
