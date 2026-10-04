# Subfase 4.5 — Entrega P0 de notificaciones internas de oportunidades

## Baseline y alcance

Implementación sobre `main`, HEAD `7e12649ed41a36e48313a5018caf50c6bbbb6b3a`, con 4.2 incorporada y árbol inicial limpio. Exclusivamente nueva oportunidad → aviso interno para Planificación, Directorio y Administración. No incluye otros eventos de 4.5 ni inicia 4.3. Sin commit ni push.

## Modelo y privacidad

`Notification` contiene UUID, destinatario, tipo `OPPORTUNITY_CREATED`, fecha, `readAt` opcional, oportunidad y hecho fuente. No copia descripción, requisitos ni contenido sensible. La oportunidad se proyecta mediante una interfaz pública de su módulo.

`NotificationDelivery` confirma que el hecho CREATED ya fue procesado. Se registra incluso cuando no hay destinatarios, para impedir entregas retrospectivas por cambios de rol. Una FK compuesta verifica identidad, oportunidad y tipo del hecho; un CHECK solo permite CREATED. Las notificaciones referencian el mismo par hecho/oportunidad del recibo. La procedencia de Notification es inmutable; `readAt` es el único campo ordinariamente modificable. No existen endpoints de eliminación ni marcado como no leído.

Deduplicación SQL: `unique(recipientUserId, sourceEventId, type)` y recibo con PK `sourceEventId`. El recibo y todos sus avisos se confirman juntos. Crear una oportunidad conserva su transacción independiente.

Todos los roles activos pueden consultar y marcar sus propios avisos. El destinatario proviene de la sesión. Ni Administración puede modificar los avisos ajenos usando UUID conocidos: recibe 404. Lecturas y contador no exponen destinatarios ni consultan avisos de otras identidades.

## Destinatarios

| Rol actual activo | Nueva oportunidad | Consultar/marcar propios |
|---|---|---|
| Administrador | Sí | Sí |
| Directorio | Sí | Sí |
| Planificación | Sí | Sí |
| Búsqueda | No globalmente | Sí |

Users ofrece una selección pública de destinatarios activos, bloqueados para lectura en orden UUID hasta confirmar el lote. Se utiliza su estado y rol actuales al procesar el hecho. No se excluye al autor si pertenece a un rol destinatario. Una desactivación posterior conserva los avisos, pero bloquea el acceso por las reglas de sesión existentes. Promociones posteriores no reentregan hechos ya procesados.

## Consumidor, checkpoint y recuperación

Node/Nest ejecuta el consumidor al iniciar y cada cinco segundos después de terminar el lote anterior. No agrega dependencias. El timer no bloquea startup, no solapa trabajos locales y se detiene esperando el trabajo en curso. Un advisory transaction lock PostgreSQL compartido evita dos consumidores simultáneos, incluso en instancias distintas.

Cada lote consulta hasta 25 hechos confirmados mediante `OpportunitiesService.recordedActivity`. Solo CREATED genera avisos. Los demás hechos avanzan el recorrido sin generar ruido. Notifications no consulta directamente la tabla interna OpportunityEvent.

`NotificationCheckpoint` persiste el cursor compuesto fecha/UUID y el límite superior de un barrido. La ampliación compatible de 4.2 agrega `recordedActivityUpperBound()` y un argumento opcional `through` en `recordedActivity(after?, limit, through?)`. Las llamadas anteriores conservan su comportamiento. El límite superior evita que ingresos continuos impidan terminar el barrido.

Al terminar un barrido se vuelve al inicio. Los recibos evitan entregas repetidas; las siguientes pasadas recuperan commits que aparecieron detrás del cursor y hechos que fallaron. La garantía no depende únicamente de timestamps ni de que los UUID reflejen orden de commit. Se procesan también los hechos CREATED ya confirmados en 4.2 que todavía no tienen recibo; los destinatarios corresponden al primer procesamiento exitoso de cada hecho.

Un savepoint por hecho revierte recibo y avisos parciales si falla la entrega. El lote puede continuar con hechos posteriores y reintenta el fallido en otra pasada. Checkpoint y cambios exitosos del lote se confirman en la misma transacción. Un rollback del lote conserva el progreso anterior. Errores técnicos generan mensajes útiles sin datos de usuarios, tokens o contenido de oportunidades.

El coste de las pasadas crece con el historial. Cada lote permanece acotado; la latencia de recuperación de hechos tardíos depende del tamaño del barrido. Es una decisión explícita para el monolito actual, sin colas, outbox, Redis ni infraestructura distribuida.

## API

- `GET /api/v1/me/notifications`: cursor, máximo 100 filas, orden descendente fecha/UUID; filtro `status=all|read|unread`.
- `GET /api/v1/me/notifications/unread-count`: COUNT en PostgreSQL con filtro por destinatario y `readAt=null`.
- `PATCH /api/v1/me/notifications/:id/read`: modificación propia idempotente; conserva el primer timestamp.

Las respuestas tienen `Cache-Control: no-store`. Los permisos explícitos `notifications.read` y `notifications.mark_read` se conceden a los cuatro roles. Guards y servicios verifican autorización; la mutación bloquea las credenciales para coordinar desactivaciones concurrentes. No se audita cada lectura ni se modifica OpportunityEvent por leer un aviso.

## Frontend

Ruta `/notifications`, indicador accesible en el layout y contador visible cuando es mayor que cero. El contador se refresca cada 30 segundos y al recuperar el foco. El centro ofrece filtro, paginación, estados de carga/vacío/error, tipo, oportunidad, fecha y leído/no leído.

Abrir el aviso marca como leído y navega a `/opportunities/:id`. Un fallo de marcado conserva la navegación, muestra el aviso de lectura pendiente e invalida consultas para sincronizar. La caché se segmenta por usuario, rol y permisos, se cancela/retira al cambiar identidad y se limpia al salir. Las respuestas tardías y navegación posterior a una mutación se descartan si cambió la identidad.

## Migraciones

Sin modificar las 39 históricas:

- `20261005010000_opportunity_notifications_p0`: enum, Notification, recibos, checkpoint, índices, FKs compuestas, deduplicación, CHECKs y trigger de procedencia inmutable.
- `20261005010001_notification_sweep_bound`: límite superior persistido del barrido y CHECK de coherencia del par.

Se validaron 41 migraciones sobre la base aislada de pruebas y desde cero en Docker con la cuenta de aplicación sin privilegios de superusuario. Prisma refleja el nombre real de la FK truncada por PostgreSQL; migrate diff no muestra divergencias.

## Validaciones y evidencia

La entrega incorpora 20 pruebas API unitarias/contrato/ciclo de vida, 16 de PostgreSQL/HTTP y 10 de frontend: 46 específicas P0.

La regresión completa de integración aprobó 1.081 pruebas en 26 suites. Después de ampliar el límite del barrido se revalidaron las suites de notificaciones y oportunidades. Las pruebas cubren destinos activos/roles actuales, acceso cruzado, FK/dedupe, concurrencia, leído/contador, paginación, rollback, fallos parciales, reanudación, commits tardíos y cierre del barrido pese a hechos posteriores.

La suite web tuvo timeouts en pruebas previas de comunicaciones con workers paralelos. Las 14 pruebas de ese archivo pasaron aisladas con un worker, sin aumentar timeouts ni modificar sus aserciones. La validación raíz final aprobó con `VITEST_MAX_WORKERS=1`, ajuste de ejecución soportado por Vitest: 711 pruebas API en 42 suites y 510 pruebas web en 27 suites.

| Validación ejecutada | Resultado |
|---|---|
| `corepack yarn lint` | Aprobada |
| `corepack yarn typecheck` | Aprobada |
| `corepack yarn test` con `VITEST_MAX_WORKERS=1` | Aprobada: 711 API + 510 web |
| `corepack yarn build` | Aprobada |
| Integración completa con PostgreSQL | Aprobada: 1.081 pruebas, 26 suites |
| Revalidación tras el límite de barrido | Aprobada: 16 notificaciones + 16 oportunidades |
| Prisma validate, migrate deploy y migrate status | Aprobadas: 41 migraciones aplicadas |
| Prisma migrate diff | Sin divergencias |
| Docker Compose config, build y arranque | Aprobados; DB/API/web saludables |
| HTTP y navegador, escritorio y móvil | Aprobados |
| Revisión del diff, secretos y `git diff --check` | Sin incidencias |

Se construyeron imágenes API/web y se usó el proyecto Docker aislado `cecasem_notifications45_audit`, con puerto web 18085 y PostgreSQL 55485 en loopback. El flujo HTTP verificó creación por Búsqueda, entrega automática a los tres roles destinatarios, exclusión de Búsqueda/inactivos, 401 anónimo y 404 ajeno. El navegador comprobó el badge de Planificación, el centro, navegación a la oportunidad y contador que pasó de uno a cero. La vista móvil 390×844 no presentó desbordamiento horizontal; consola sin errores. Las capturas están fuera del repositorio, en la carpeta de visualizaciones del chat.

Los avisos existentes de Vite por chunk de aproximadamente 674 kB, VM Modules de Jest y consultas concurrentes de pg permanecen visibles. No se añadieron dependencias, cambios de timeouts globales ni infraestructura de producción.

Con las imágenes finales se verificó otra oportunidad y su entrega automática, conservando el aviso previo leído. Tras recrear/reiniciar el API no hubo duplicados y permanecieron las sesiones y el contador. DB/API/web estuvieron saludables. Se confirmó `rolsuper=false` para la cuenta de aplicación.

Al terminar se desactivaron las seis cuentas sintéticas, se revocaron sus sesiones y se retiraron hashes de contraseña y archivos temporales. Se detuvo solo el proyecto Docker aislado, sin eliminar volúmenes. Los contenedores preexistentes y las pestañas de Codex se preservaron.

La entrega P0 puede cerrarse con las observaciones de ejecución anteriores. No quedan criterios funcionales P0 pendientes. Git conserva el HEAD inicial, con 25 archivos cambiados, ninguno preparado para commit; no se realizó commit ni push.

## Inventario

### Backend

- `apps/api/prisma/schema.prisma`
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/auth/authorization/authorization.spec.ts`
- `apps/api/src/modules/auth/authorization/permission.ts`
- `apps/api/src/modules/auth/authorization/role-permissions.ts`
- `apps/api/src/modules/users/users.service.ts`
- `apps/api/src/modules/opportunities/opportunities.service.ts`
- `apps/api/src/modules/notifications/notification-consumer.ts`
- `apps/api/src/modules/notifications/notification-consumer.spec.ts`
- `apps/api/src/modules/notifications/notification-cursor.ts`
- `apps/api/src/modules/notifications/notification.dto.ts`
- `apps/api/src/modules/notifications/notification.spec.ts`
- `apps/api/src/modules/notifications/notifications.controller.ts`
- `apps/api/src/modules/notifications/notifications.module.ts`
- `apps/api/src/modules/notifications/notifications.service.ts`
- `apps/api/test/notifications.integration-spec.ts`

### Frontend

- `apps/web/src/app/layout/authenticated-layout.tsx`
- `apps/web/src/app/router/app-routes.tsx`
- `apps/web/src/features/notifications/contracts.ts`
- `apps/web/src/features/notifications/queries.ts`
- `apps/web/src/features/notifications/notifications-page.tsx`
- `apps/web/src/features/notifications/notifications-page.test.tsx`

### Migraciones y documentación

- `apps/api/prisma/migrations/20261005010000_opportunity_notifications_p0/migration.sql`
- `apps/api/prisma/migrations/20261005010001_notification_sweep_bound/migration.sql`
- `docs/subfase-4.5-p0-notificaciones.md`
