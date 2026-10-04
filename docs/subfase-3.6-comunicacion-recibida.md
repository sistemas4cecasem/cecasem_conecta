# Subfase 3.6 — Registro manual de comunicación recibida

Se extiende el módulo `communications` de 3.5 para conservar hechos externos recibidos. No se consultan buzones, envían mensajes, sincronizan proveedores ni analizan MIME.

## Modelo y contrato

Se reutilizan `Communication` y `CommunicationRecipient`, sin tablas separadas para enviadas/recibidas. `CommunicationDirection` incorpora `RECEIVED`; ambas direcciones comparten asunto, cuerpo original de texto plano, registrador, creación, destinatarios y validez inicial `VALID`.

La fecha unificada `occurredAt` permite ordenar ambas direcciones por el instante real, con desempate por ID. SENT conserva `sentAt` y exige su cuenta/snapshots de 3.5; RECEIVED conserva `receivedAt`, un remitente externo textual y no lleva cuenta de envío. La migración copia las fechas existentes a `occurredAt`, sin alterar sus originales.

El remitente original conserva mayúsculas. `senderNormalizedAddress` usa `lower()` de PostgreSQL, con índice por dirección normalizada/fecha/ID; la búsqueda interna usa la misma normalización Unicode. Los destinatarios conservan originales, tipo TO/CC/BCC y posición por tipo. TO requiere al menos una dirección; CC/BCC son opcionales y CCO solo se documenta cuando se conoce. Máximo 100 destinatarios y 254 caracteres por dirección.

Los destinatarios que coinciden con una cuenta CECASEM conocida pueden guardar una FK auxiliar y el nombre visible como snapshot. Se incluyen cuentas desactivadas y sin asignación al registrador. El original sigue siendo el dato histórico; renombrar/desactivar la cuenta o retirar una asignación no lo modifica. Las direcciones desconocidas son válidas y no crean personas, organizaciones ni ContactMethod automáticamente. No se infieren contactos del directorio ni asociaciones entre mensajes/procesos.

El asunto admite hasta 998 caracteres, sin saltos de línea; el cuerpo hasta 200000. Se conserva el texto, espacios, saltos, firma y URLs, sin interpretar HTML. La fecha real exige ISO con zona horaria, admite registro retrospectivo sin límite inferior artificial y rechaza fechas inválidas/futuras. El formulario convierte su hora local a UTC e informa la zona utilizada.

## Autorización y API

Los cuatro roles iniciales reciben `communications.received.create`; se exige además `relationships.process.read`, sesión válida y usuario activo. No se requiere participación previa ni buzón asignado.

`POST /api/v1/relationship-processes/:id/communications/received` acepta `sender`, `to`, `cc`, `bcc`, `subject`, `body` y `receivedAt`. CC/BCC omitidos son listas vacías. El servidor determina proceso, dirección, registrador, creación, participación y auditoría. Se rechazan campos adicionales de asignación masiva.

Se reutilizan `GET /communications/:id` y `GET /relationship-processes/:id/communications` bajo `/api/v1`. El detalle distingue direcciones y muestra remitente, todos los destinatarios, fecha real y de registro, contenido y autoría. El listado es mixto, paginado y ordenado por `occurredAt DESC, id DESC`; no es el timeline de 3.7. SENT mantiene su comportamiento y la exigencia de cuenta propia activa.

## Proceso cerrado y no contacto

Una recibida puede documentarse tanto en un proceso abierto como cerrado. No cambia automáticamente su estado, resultado, fecha/autor de cierre ni eventos históricos. La participación adquirida puede permitir posteriormente la reapertura explícita según las reglas de 3.3.

La antigua constraint de 3.2 exigía `closedAt = lastActivityAt`. Se sustituye exclusivamente en una migración nueva por `closedAt <= lastActivityAt`: un hecho posterior actualiza actividad sin reescribir el cierre. Los demás checks de cierre permanecen.

Una restricción de no contacto no impide conservar una entrada. La recepción no comprueba el bloqueo de acercamientos salientes ni levanta la restricción. Una enviada posterior continúa bloqueada mientras la restricción siga activa.

## Transacción, actividad e idempotencia

Orden de locks: usuario `FOR UPDATE`, proceso `FOR UPDATE`. No hay locks de asignaciones/buzones ni advisory de no contacto en recepción. Los lectores auxiliares de cuentas solo aportan contexto histórico. Los módulos propietarios siguen proporcionando sus interfaces públicas, sin dependencias circulares.

La transacción crea comunicación/destinatarios/snapshots, asegura participación `RECEIVED_COMMUNICATION`, actualiza actividad/versión del proceso y registra auditoría. Un fallo revierte todo. La primera fecha/origen de participación no cambia si ya existe.

La actividad mantiene la regla de 3.5: `max(lastActivityAt, createdAt del registro)`. Una fecha real antigua no retrocede la actividad; el estado permanece igual. La versión incrementada conserva la protección optimista de cierre/reapertura.

Si cierre/reapertura obtiene primero el lock, la recibida se registra después y conserva el estado confirmado, incluso CLOSED. Si la recibida confirma primero, una acción basada en una versión anterior recibe `VERSION_CONFLICT`; tras actualizar, el usuario puede confirmar el cierre/reapertura existente. La comunicación nunca se descarta por el cierre, ni se eluden permisos/versiones de las acciones formales.

Se reutiliza `Idempotency-Key` UUID obligatorio y la unicidad registrador/clave. La huella de RECEIVED incluye dirección, proceso, remitente, destinatarios ordenados, texto exacto e instante real. Repetir la misma solicitud devuelve el original confirmado sin nuevos efectos; cambiar contenido/proceso/dirección con una clave usada devuelve 409. Claves distintas permiten hechos diferentes con contenido idéntico. El formulario conserva la clave para reintentos y bloquea confirmaciones simultáneas.

## Auditoría e inmutabilidad

`RECEIVED_COMMUNICATION_REGISTERED` conserva actor interno, comunicación, proceso, operación y fecha, sin copiar cuerpo ni destinatarios. La migración extiende el check preservando las familias de auditoría anteriores.

No existen operaciones ordinarias para editar remitente, destinatarios, asunto o cuerpo ni borrar comunicaciones. Correcciones e invalidaciones quedan para 3.8. Las FK históricas utilizan `RESTRICT`.

## Frontend

El detalle del proceso ofrece Registrar comunicación recibida incluso cerrado. El formulario usa React Hook Form/Zod, remitente libre validado, destinatarios observados, fecha real, revisión del original y confirmación explícita. La advertencia de cierre no bloquea el registro; una restricción se muestra con explicación de que permite documentar la entrada.

El éxito invalida comunicaciones, procesos/participantes y contexto. El detalle de la recibida consulta el proceso actual y, si está cerrado y la política permite reapertura, ofrece `Reabrir proceso` mediante el detalle existente y su formulario autorizado. Nunca ejecuta reapertura automática. La cache y las respuestas tardías respetan identidad/rol/capacidades.

## Contratos públicos para 3.4-B

`historyForProcess` proporciona existencia, total, última fecha real y hasta cinco resúmenes con dirección, proceso, remitente y destinatarios originales. Los lectores internos autorizados disponen también de conteos/resúmenes y búsqueda acotada por dirección normalizada de remitente o destinatario. No se añade un endpoint de búsqueda ni se implementa RF-57 completa.

**SUBFASE 3.4 COMPLETADA: NO.** 3.5 y 3.6 ya proporcionan las fuentes reales; falta integrarlas expresamente en la proyección de advertencias/contexto mediante 3.4-B. La proyección actual de 3.4-A permanece sin cambios.

## Migraciones y validación

Se añaden `20261004023000_received_communication_enums` y `20261004023001_received_communications`. Separan la incorporación y uso de los valores enum, amplían el modelo común, añaden índices/checks/FK y permiten actividad posterior al cierre. Las 27 migraciones anteriores no se modifican.

Pruebas nuevas: originales/fechas/huella, coordinación transaccional, cuatro roles, ausencia de buzón propio, recepción con cierre/no contacto, autoría, participación inicial/idempotente, historia, rollback, lectura mixta, contratos de antecedentes, reintentos/dos recibidas y carreras con cierre/reapertura/desactivación. El frontend cubre formulario, destinatarios, confirmación, cierre/restricción, errores con borrador, pendientes, detalle, participación y reapertura explícita posterior.

Validaciones requeridas: lint, typecheck, test y build de raíz; suite PostgreSQL completa en base aislada; Prisma validate/deploy/status y comparación de schema; revisión SQL/diff/secretos/espacios. No se realiza commit ni push.

## Resultados de cierre

- Backend: 553 pruebas aprobadas en 35 suites; frontend: 427 pruebas en 22 archivos.
- PostgreSQL completo: 962 pruebas aprobadas en 21 suites, en la base aislada `_test`.
- Nuevas pruebas de 3.6: 21 unitarias, 39 de integración y 14 de frontend.
- Lint, typecheck, test y build de raíz correctos. Prisma validate correcto.
- Migrate deploy/status: 29 migraciones aplicadas, sin pendientes en desarrollo/test aislados. Prisma migrate diff no detecta diferencias de schema.
- Las 27 migraciones anteriores permanecen intactas. Cambios previos fuera de 3.6 conservados.
- Revisión SQL, diff, espacios, secretos y archivos sensibles/runtime sin incidencias.
- Advertencia existente de Vite: chunk principal de 615.54 KB, superior a 500 KB. El build finaliza correctamente.
- Rama `main`, HEAD `b912383`, 27 archivos propios de 3.6. Sin staging, commit ni push.

## Archivos propios de 3.6

- `apps/api/prisma/schema.prisma`
- `apps/api/src/modules/audit/audit.service.ts`
- `apps/api/src/modules/auth/authorization/authorization.spec.ts`
- `apps/api/src/modules/auth/authorization/permission.ts`
- `apps/api/src/modules/auth/authorization/role-permissions.ts`
- `apps/api/src/modules/users/users.service.ts`
- `apps/api/test/password-reset.integration-spec.ts`
- `apps/web/src/app/router/app-routes.tsx`
- `apps/api/prisma/migrations/20261004023000_received_communication_enums/migration.sql`
- `apps/api/prisma/migrations/20261004023001_received_communications/migration.sql`
- `apps/api/src/modules/communications/communication.dto.ts`
- `apps/api/src/modules/communications/communication.rules.ts`
- `apps/api/src/modules/communications/communications.controller.ts`
- `apps/api/src/modules/communications/communications.service.spec.ts`
- `apps/api/src/modules/communications/communications.service.ts`
- `apps/api/src/modules/communications/received-communication.rules.spec.ts`
- `apps/api/test/received-communications.integration-spec.ts`
- `apps/web/src/features/communications/communication-detail-page.tsx`
- `apps/web/src/features/communications/communications-list.tsx`
- `apps/web/src/features/communications/contracts.ts`
- `apps/web/src/features/communications/queries.ts`
- `apps/web/src/features/communications/received-communication-page.tsx`
- `apps/web/src/features/communications/received-communications.test.tsx`
- `apps/web/src/features/communications/sent-communications.test.tsx`
- `apps/web/src/features/relationships/process-queries.ts`
- `apps/web/src/features/relationships/relationship-process-detail-page.tsx`
- `docs/subfase-3.6-comunicacion-recibida.md`
