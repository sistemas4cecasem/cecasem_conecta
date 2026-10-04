# Subfase 3.2 — Procesos de relación

## Baseline y alcance

Branch `main`; HEAD inicial y commit de 3.1-A:
`b912383a0874e4519f3a27aade9a712da32f319c`. Árbol inicial limpio. La referencia
local `origin/main` está un commit detrás; no se hizo fetch ni push, por lo que
no se afirma conocer el estado actual del servidor remoto.

Node v24.14.0; Yarn global 1.22.22; todas las operaciones del proyecto usan
Corepack/Yarn 4.18.1. Sin cambios de packageManager, dependencias o lockfile.

La comprobación de entrada aprobó 399 pruebas API, 289 frontend y 699
PostgreSQL/HTTP. Se leyeron los tres AGENTS.md, prompt 3.2, reglas 3.1-A,
schema, migraciones y módulos auth/users/audit/directory/relationships.

Esta entrega permite crear, listar, consultar, cambiar estado, cerrar y reabrir
procesos. Incluye únicamente el participante creador. No implementa 3.3,
comunicaciones, notas, reuniones, oportunidades, archivos, restricciones,
notificaciones, recordatorios, sincronización o envío de correo.

## Modelo

RelationshipProcess conserva UUID, propósito (1–5000 caracteres), exactamente
una FK Organization/Person, creador, sourceIntentId opcional y único, estado,
versión positiva, creación, actualización, última actividad y cierre vigente
(resultado, observación, fecha y usuario). Las personas nuevas deben ser
independientes; el Directorio valida fichas activas sin consolidar y ausencia de
vínculos vigentes. Los procesos históricos conservan la FK aunque la ficha o
cuenta posteriormente se inactive/consolide.

Estado inicial: PREPARATION, versión 1. Estados oficiales: PREPARATION,
IN_PROGRESS, WAITING_RESPONSE, NEGOTIATION, CLOSED. Resultados: ACHIEVED, REJECTED,
NO_RESPONSE, CECASEM_WITHDREW, OTHER. Se permiten procesos paralelos por actor.

CHECK PostgreSQL: un actor, propósito con contenido, versión positiva, fechas
coherentes, CLOSED con resultado/fecha/usuario, abiertos sin campos de cierre,
OTHER con observación significativa. Índices por actor/estado/creación, estado,
creador, creación, cerrador; participante por usuario; eventos por proceso/fecha
y actor. Todas las FK nuevas usan RESTRICT para delete y update.

## Participación y atomicidad

ProcessParticipant tiene PK (processId,userId), joinedAt y origen PROCESS_CREATOR.
Crear confirma proceso + participante creador + evento CREATED + auditoría en
una transacción. Fallar cualquiera revierte la operación; se prueba el fallo
después de insertar el proceso y antes de incorporar participante.

Consultar no incorpora participantes. No existen alta/baja manual ni endpoints
para añadir participantes. En 3.3 deberá ampliarse su origen por actuaciones
formales y completarse la policy contextual. La autorización consulta la fila
de participación; no compara propiedad permanente ni solo createdByUserId.

## Política explícita de estados

| Estado actual | Destinos mediante state |
| --- | --- |
| PREPARATION | IN_PROGRESS, WAITING_RESPONSE |
| IN_PROGRESS | PREPARATION, WAITING_RESPONSE, NEGOTIATION |
| WAITING_RESPONSE | IN_PROGRESS, NEGOTIATION |
| NEGOTIATION | IN_PROGRESS, WAITING_RESPONSE |
| CLOSED | Ninguno |

La preparación permite iniciar trabajo o esperar respuesta; negociar requiere
trabajo iniciado. Los retornos operativos permiten continuar/revisar sin abrir
un objetivo distinto. Se rechazan no-op y saltos no incluidos. No se exige una
secuencia lineal. Cerrado se alcanza/abandona solo con casos de uso específicos.

Cierre recibe resultado obligatorio y observación condicional para OTHER.
Reapertura recibe estado abierto explícito y motivo significativo del mismo
acercamiento. Limpia los campos del cierre vigente sin tocar eventos previos.
No se automatiza por una comunicación recibida.

## Autorización

Capacidades relationships.process.read, .create, .state.change, .close, .reopen.
Los cuatro roles reciben capabilities generales; el backend decide contexto.

| Acción | Administración | Directorio | Búsqueda | Planificación |
| --- | --- | --- | --- | --- |
| Crear/consultar | Sí | Sí | Sí | Sí |
| Cambiar estado | Sí | Sí | Participante* | Participante* |
| Cerrar participante | Excepcional auditado | Sí | Sí | Sí |
| Cerrar no participante | Excepcional auditado | Sí | No | No |
| Reabrir participante | Excepcional auditado | Sí | Sí | Sí |
| Reabrir no participante | Excepcional auditado | Sí | No | No |

* El prompt no precisa la condición contextual de cambio de estado para
Búsqueda/Planificación. Se consultó al usuario y, sin respuesta durante esta
ejecución, se aplicó el criterio conservador de participación formal, coherente
con cierre/reapertura. Requiere ratificación funcional; no se presenta como una
regla oficial adicional. Se anunció antes de implementar el caso de uso.

Guards y servicios validan capability. Escrituras usan withLockedCredentials
de UsersService y revalidan usuario activo/rol vigente bajo lock; no confían en
una identidad obsoleta del guard. DTO whitelist rechaza creador, participantes,
estado inicial, versiones/fechas iniciales, auditor y sourceIntentId del cliente.

## Historia, auditoría y concurrencia

RelationshipProcessEvent conserva proceso, tipo, estado anterior/nuevo,
resultado del cierre, observación/motivo, usuario, autoridad ejercida, versión y
fecha. UNIQUE(processId,version) impide dos eventos para una versión. No hay API
para editar/borrar eventos; el estado actual permanece en RelationshipProcess.

AuditEvent conserva acción PROCESS_CREATED/STATE_CHANGED/CLOSED/REOPENED, actor,
operationId y FK única processEventId. La FK identifica el proceso y la autoridad
registrada en el evento (PARTICIPANT, BOARD o ADMINISTRATOR). Los cierres y
reaperturas de Administración se registran explícitamente como excepcionales;
Directorio conserva autoridad explícita aunque no participe. Un cambio posterior
de rol no reinterpreta esa autoridad histórica. Auditoría no reemplaza la historia
funcional ni se utiliza DirectoryChange.

Cada modificación bloquea la fila del proceso, valida participación y
expectedVersion y hace update condicionado. Proyección, evento y auditoría
confirman juntos; errores revierten todos. Versiones obsoletas reciben 409;
segundos cierres/reaperturas no sobrescriben actuaciones anteriores.

## REST /api/v1

| Método/ruta | Capability | Contexto |
| --- | --- | --- |
| GET relationship-processes | read | Activo; paginación/filtros |
| POST relationship-processes | create | Actor utilizable, creador de sesión |
| GET relationship-processes/:id | read | Activo |
| GET relationship-processes/:id/participants | read | Activo; solo lectura |
| GET relationship-processes/:id/events | read | Activo; paginación |
| POST relationship-processes/:id/state | state.change | Participación/excepción, transición y versión |
| POST relationship-processes/:id/close | close | Participación/excepción, resultado y versión |
| POST relationship-processes/:id/reopen | reopen | Participación/excepción, cerrado, estado/motivo y versión |

Prefijo de capabilities: relationships.process. POST responde 201 conforme a la
convención Nest existente; GET no-store. UUID validado; 400 entrada, 401 sesión,
403 autorización, 404 proceso, 409 objetivo/estado/versión. No se retornan hashes,
credenciales ni correos privados en proyecciones de procesos.

Listado: page default 1, pageSize default 25/máximo 100, state default all,
createdByUserId/organizationId/personId opcionales. Orden createdAt/id descendente.
Conteo y lecturas usan RepeatableRead. Detalle incluye hasta 25 eventos más
recientes y total; events permite recorrer historia completa ordenada por
createdAt/version descendente. Participantes muestran el creador actual de 3.2.

## Frontend

Rutas /relationship-processes, /relationship-processes/new y
/relationship-processes/:id, integradas en navegación autenticada. Listado con
estado/paginación/contexto, creación con selector contextual del Directorio ya
existente y propósito, detalle con participantes e historia paginada.

Formularios React Hook Form/Zod separados para cambiar estado, cerrar y reabrir.
El estado inicial no es seleccionable. Solo se muestran destinos permitidos por
backend. Reapertura exige destino/motivo y confirmación; OTHER exige observación.
403/409 preservan formularios/contexto, no reintentan automáticamente y requieren
recargar/revisar. Recargar preserva texto si el formulario todavía corresponde al
estado; una operación exitosa actualiza detalle e invalida listado/historia.

Queries bajo relationship-processes + identidad/rol/capabilities, independientes
de la caché de intenciones. Logout/cambio de identidad/rol/capability cancela y
retira consultas anteriores. Respuesta tardía de mutación no repuebla caché de
una sesión retirada. La visibilidad combina capabilities con proyección backend.

## Conversión 3.1

SUBFASE 3.1 COMPLETADA: NO.
Conversión intención → proceso: PENDIENTE.

Ya existe base transaccional suficiente para proceso/participante creador y el
vínculo opcional/único con intención. Sin embargo, 3.1-A define propiedad para
cancelar y no define autorización para convertir intención propia/ajena ni quién
debe ser creador si quien convierte difiere del autor. Se consultó al usuario;
no se recibió definición durante esta ejecución. No se extrapola permiso de
cancelación ni se declara una conversión inexistente. Falta esa decisión funcional
y su integración atómica con locks/versionado, vínculo, transición ACTIVE →
CONVERTED, auditoría y pruebas de doble conversión/rollback. No requiere inventar
infraestructura ni implementar comunicaciones para resolverla.

## Migraciones

- 20261003192200_process_audit_actions: cuatro nuevas acciones AuditAction.
- 20261003192201_relationship_processes: tres entidades, enums, FK/índices/CHECK;
  nuevo processEventId; amplía CHECK de auditoría manteniendo familias anteriores
  y rechazando referencias cruzadas.

SQL generado con Prisma migrate diff desde desarrollo aislado, revisado y
completado antes de aplicar. migrate dev --create-only no pudo ejecutarse por la
sesión no interactiva (también con PTY); no se alteraron migraciones históricas.
Separar AuditAction evita utilizar valores PostgreSQL nuevos en la migración que
los añade. Deploy/status aprobados en desarrollo y _test: 21 migraciones al día;
diff datasource/schema no detecta diferencias en desarrollo. Runtime institucional
no migrado, sin cambios de Docker/infrastructura.

## Validación

Resultado técnico: SUBFASE 3.2 COMPLETADA CON OBSERVACIONES. El criterio provisional
de participación para cambiar estado requiere ratificación funcional, según lo
explicado arriba. SUBFASE 3.1 COMPLETADA: NO; no se declara 3.3 completa.

- corepack yarn lint: OK, sin errores ni warnings en ejecución final.
- corepack yarn typecheck: OK.
- corepack yarn test: OK, API 27 suites/452 pruebas y web 18 archivos/325 pruebas.
- corepack yarn build: OK.
- Integración PostgreSQL/HTTP completa: OK, 16 suites/763 pruebas.
- Total: 1.540 pruebas aprobadas; nuevas: 53 reglas, 64 integración, 36 frontend.
- Prisma validate, migrate deploy y migrate status: OK en entorno aislado.
- 21 migraciones al día en desarrollo y _test; diff development/schema vacío.
- git diff --check y whitespace de archivos nuevos: OK.
- Diff, rutas, secretos y alcance revisados; sin cambios ajenos a esta entrega.

Cobertura de comportamiento: rollback de participante/auditoría, creación
inicial, participación/roles vigentes, estados/resultados, historia tras
reapertura, concurrencia (estado/estado, cierre/cierre, cierre/estado,
reapertura/reapertura y reapertura/cierre), constraints/FK, formularios, permisos,
403/409 y caché frontend. El test de participación comprueba que autoría no
sustituye la fila de participante.

La primera regresión integral encontró cuatro casos nuevos PROCESS_* incluidos
accidentalmente por un filtro negativo de la suite de administración. El filtro
ahora selecciona exclusivamente PASSWORD_RESET_*, USER_* y MAILBOX_*; las acciones
de procesos se prueban en su suite propia. También se amplió la lista exacta de
columnas de auditoría en password-reset, exigiendo processEventId NULL. No se
debilitaron constraints. La segunda ejecución completa aprobó los 763 casos.

Durante la validación se corrigieron fixtures/etiquetas accesibles y tipado de
tests nuevos. No quedan regresiones técnicas conocidas. La UI se verificó con
Testing Library; no se afirma un recorrido manual de navegador ni despliegue.

Observaciones no bloqueantes de herramientas: VM Modules experimental, aviso pg
de consultas concurrentes en suites existentes, y bundle Vite principal
571,39 kB (gzip 162,68 kB), por encima de 500 kB. No se alteraron umbrales/reglas
para ocultarlos. El aviso nuevo de React Hook Form se resolvió usando useWatch.

## Git y continuidad

Cambios limitados a schema/migraciones, relaciones, autorización/auditoría,
frontend de procesos, pruebas y este informe. 28 archivos (12 modificados y 16
nuevos). HEAD conserva b912383; no se modifica el commit 3.1-A.

Commit realizado: NO. Push realizado: NO.

Siguiente subfase: completar en 3.3 incorporación por actuaciones formales,
orígenes de participación y policy contextual definitiva. Las comunicaciones
enviadas/recibidas, notas, restricciones, reuniones, oportunidades, archivos,
recordatorios y demás integraciones permanecen en sus subfases correspondientes.
