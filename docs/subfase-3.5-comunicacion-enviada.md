# Subfase 3.5 — Registro manual de comunicación enviada

El módulo `communications` conserva un mensaje efectivamente enviado mediante un canal externo. No envía correo, sincroniza bandejas ni acredita entrega. Cada registro pertenece a un único proceso existente y abierto.

## Contrato y conservación histórica

`Communication` guarda dirección `SENT`, validez inicial `VALID`, versión inicial 1, proceso, registrador, cuenta institucional utilizada, snapshots de dirección/nombre de cuenta y remitente, asunto, cuerpo original de texto plano, fecha real y fecha de registro. Las referencias utilizan UUID y claves foráneas `RESTRICT`.

`CommunicationRecipient` conserva tipo `TO/CC/BCC`, dirección original, dirección normalizada auxiliar en minúsculas mediante PostgreSQL (la búsqueda aplica la misma normalización Unicode) y posición dentro de cada tipo. TO requiere al menos una dirección; CC/BCC son opcionales. Máximo 100 destinatarios totales. Se admiten direcciones externas sin crear contactos del Directorio y se conservan sus mayúsculas, duplicados y orden. El formulario separa direcciones por coma, punto y coma o salto de línea y elimina solamente el espacio alrededor de cada dirección.

El asunto conserva espacios originales (máximo 998 caracteres; sin saltos de línea). El cuerpo conserva espacios, saltos, firmas, URLs y texto literal (máximo 200000 caracteres). React muestra el cuerpo como texto escapado, sin interpretar HTML. El límite HTTP JSON es 2 MB para admitir el cuerpo máximo incluso escapado. Se exige texto no vacío. La fecha real admite historia sin límite inferior artificial, exige ISO con zona horaria y rechaza instantes futuros; el formulario convierte la fecha/hora local a UTC e informa su zona horaria.

No existen operaciones públicas ordinarias de edición ni eliminación. La futura corrección/invalidez corresponde a 3.8. No se trata la versión inicial como autorización para reescribir originales.

## API

Todas las rutas parten de `/api/v1`, requieren sesión y capacidades actuales. Los cuatro roles iniciales reciben `communications.read` y `communications.sent.create`; también se exige `relationships.process.read`.

| Método y ruta | Función |
| --- | --- |
| `GET /me/email-accounts` | Solo cuentas activas asignadas al usuario actual; devuelve ID, dirección y nombre. |
| `POST /relationship-processes/:id/communications/sent` | Registra un original enviado con cuenta, TO, CC/BCC opcionales, asunto, cuerpo y fecha real. |
| `GET /communications/:id` | Detalle histórico con todos los destinatarios, incluido BCC. |
| `GET /relationship-processes/:id/communications?page=1&pageSize=25` | Resumen paginado, ordenado por fecha real descendente e ID. |

El remitente se deriva de la cuenta; no admite campos de autoría, estado, snapshots o fecha de registro enviados por el cliente. Lecturas operativas/históricas llevan `Cache-Control: no-store` y no generan participación, actividad ni auditoría.

Errores relevantes: 400 original/clave inválidos; 403 permisos o usuario inactivo; 404 proceso/comunicación ausentes; 409 `MAILBOX_UNAVAILABLE`, `PROCESS_CLOSED`, `CONTACT_RESTRICTED` o `REQUEST_CONFLICT`. El proceso cerrado necesita reapertura por el flujo ya autorizado, sin reapertura automática.

## Transacción y concurrencia

El registro usa las interfaces públicas de Users, Relationships, Participation, Restrictions y Audit, sin dependencia circular. Orden de locks: usuario `FOR UPDATE`, cuenta `FOR SHARE`, asignación `FOR SHARE`, proceso `FOR UPDATE`, clave advisory del actor principal usada en 3.9. Esto estabiliza usuario activo, cuenta/asignación, proceso abierto y ausencia de restricción hasta commit.

La transacción crea comunicación/destinatarios, asegura participante `SENT_COMMUNICATION`, actualiza actividad y versión del proceso y persiste auditoría. Cualquier fallo revierte todo. El estado del proceso no cambia. La actividad se basa en la fecha de registro y toma el máximo respecto a la existente, nunca la fecha histórica del correo. La versión incrementada protege acciones de cierre basadas en una pantalla anterior. La primera fecha y origen de participación permanecen intactos si el registrador ya participaba.

La auditoría `SENT_COMMUNICATION_REGISTERED` guarda comunicación, actor, operación y fecha; no duplica cuerpo ni destinatarios. Las migraciones conservan los checks de todas las familias anteriores y añaden el vínculo exclusivo con comunicación.

## Reintentos

El POST exige `Idempotency-Key` con UUID. El par registrador/clave es único. Una huella SHA-256 identifica proceso, cuenta, destinatarios originales ordenados, asunto, cuerpo e instante real. La misma clave y contenido devuelve el registro confirmado sin nuevos efectos; otra carga con esa clave recibe 409. Claves diferentes permiten mensajes reales con contenido idéntico.

Una repetición confirmada puede recuperar el registro aunque el proceso se haya cerrado o el buzón se haya retirado después; sigue exigiendo usuario activo y capacidades actuales. No equivale a otra actuación formal. El formulario conserva la clave durante el borrador y sus reintentos, no reintenta automáticamente la mutación y bloquea confirmaciones simultáneas. Ante resultado ambiguo, revisar el listado antes de comenzar otro registro.

## Frontend y límites de fase

El proceso abierto ofrece la acción contextual. El formulario usa React Hook Form/Zod, selector de cuentas propias, validación, revisión del original y confirmación explícita. Informa ausencia de buzones, cierre y restricción activa. Los errores mantienen el borrador y ofrecen recargar cuentas/proceso/contexto. El éxito invalida consultas de comunicaciones, procesos/participantes y contexto institucional. La cache y los resultados tardíos respetan identidad, rol y capacidades.

El listado pertenece exclusivamente a comunicaciones enviadas; no es timeline unificado. El detalle expone remitente y destinatarios históricos, ambas fechas, autoría y cuerpo sin edición.

El servicio exporta conteo por proceso, resúmenes recientes y búsqueda interna de resúmenes por destinatario normalizado. Estas interfaces no son endpoints de búsqueda ni implementan 3.4-B.

**SUBFASE 3.4 COMPLETADA: NO.** Falta comunicación recibida de 3.6 y posterior integración final del contexto. No se implementan recibidas, adjuntos, traducción, notas, correcciones, reuniones, oportunidades ni notificaciones en 3.5.

## Migraciones

Se incorporan `20261004013000_communication_audit_action` y `20261004013001_sent_communications`. La primera permite usar el nuevo valor de auditoría en la segunda sin mezclar su creación y utilización. Las 25 migraciones anteriores permanecen sin cambios.

## Verificación

Las pruebas nuevas cubren reglas del original, roles, buzones propios, DTOs, destinatarios externos, snapshots, historia, participación inicial/idempotente, actividad/estado, lectura pura, ausencia de edición/eliminación, rollback, restricciones, reintentos concurrentes y espera/revalidación de bajas/cierre. El frontend cubre validación, confirmación, TO/CC/BCC, texto literal seguro, errores con borrador, pendientes, cuentas vacías, cierre, restricción, detalle, paginación y refresco de participantes.

Validaciones de cierre: lint, typecheck, test y build desde la raíz; suite PostgreSQL completa en base aislada `_test`; Prisma validate, migrate deploy/status en bases aisladas; revisión SQL, diff, espacios y secretos. No se ejecuta commit ni push.

## Resultados de validación

- Raíz: `corepack yarn lint`, `typecheck`, `test` y `build` ejecutados correctamente.
- Backend: 532 pruebas (34 suites), incluidas 27 pruebas unitarias nuevas de comunicaciones.
- Frontend: 413 pruebas (21 archivos), incluidas 19 nuevas de comunicaciones.
- PostgreSQL: suite completa de 20 suites y 922 pruebas aprobada; después del ajuste de normalización Unicode se ejecutó nuevamente la suite específica, con sus 46 pruebas aprobadas (incluye la regresión nueva).
- Prisma validate correcto; migrate deploy/status sin pendientes en ambas bases aisladas, con 27 migraciones. Las 25 anteriores no se alteraron.
- Revisión de SQL, diff, espacios y archivos sensibles/runtime sin incidencias. Cambios previos fuera del alcance intactos.
- Build web correcto; persiste la advertencia de chunk principal superior a 500 KB (607.17 KB). No bloquea esta subfase.
- Rama `main`, HEAD `b912383`, sin staging, commit ni push. 33 archivos propios de esta subfase; los cambios acumulados incluyen las entregas anteriores.

## Archivos propios de 3.5

- `apps/api/prisma/schema.prisma`
- `apps/api/src/app.module.ts`
- `apps/api/src/config/application.ts`
- `apps/api/src/modules/audit/audit.service.ts`
- `apps/api/src/modules/auth/authorization/authorization.spec.ts`
- `apps/api/src/modules/auth/authorization/permission.ts`
- `apps/api/src/modules/auth/authorization/role-permissions.ts`
- `apps/api/src/modules/relationships/relationships.module.ts`
- `apps/api/src/modules/users/users.service.ts`
- `apps/api/test/password-reset.integration-spec.ts`
- `apps/web/src/app/layout/authenticated-layout.tsx`
- `apps/web/src/app/router/app-routes.tsx`
- `apps/web/src/lib/api/client.ts`
- `apps/api/prisma/migrations/20261004013000_communication_audit_action/migration.sql`
- `apps/api/prisma/migrations/20261004013001_sent_communications/migration.sql`
- `apps/api/src/modules/communications/communication-error.filter.ts`
- `apps/api/src/modules/communications/communication.dto.ts`
- `apps/api/src/modules/communications/communication.rules.spec.ts`
- `apps/api/src/modules/communications/communication.rules.ts`
- `apps/api/src/modules/communications/communications.controller.ts`
- `apps/api/src/modules/communications/communications.module.ts`
- `apps/api/src/modules/communications/communications.service.ts`
- `apps/api/src/modules/relationships/relationship-processes.service.ts`
- `apps/api/test/sent-communications.integration-spec.ts`
- `apps/web/src/features/communications/communication-detail-page.tsx`
- `apps/web/src/features/communications/communications-list.tsx`
- `apps/web/src/features/communications/contracts.ts`
- `apps/web/src/features/communications/queries.ts`
- `apps/web/src/features/communications/sent-communication-page.tsx`
- `apps/web/src/features/communications/sent-communications.test.tsx`
- `apps/web/src/features/relationships/relationship-process-detail-page.tsx`
- `docs/subfase-3.5-comunicacion-enviada.md`
- `apps/api/src/modules/communications/communications.service.spec.ts`
