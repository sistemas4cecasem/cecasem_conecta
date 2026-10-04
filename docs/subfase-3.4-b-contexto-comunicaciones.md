# Subfase 3.4-B — Comunicaciones reales en el contexto institucional

Completa la proyección de 3.4-A usando los registros SENT/RECEIVED de 3.5/3.6.
No agrega persistencia, migraciones, dependencias ni estados de invalidación.

## Contrato y autorización

Se mantiene `GET /api/v1/relationship-context?organizationId=<uuid>` o
`?personId=<uuid>`, su validación, errores y `Cache-Control: no-store`.
Se conservan los campos de 3.4-A y se añaden, por actor:

- `hasRegisteredCommunicationHistory`: existencia de comunicaciones VALID.
- `communicationSummary`: `total`, `lastOccurredAt`, `lastDirection`.
- `recentCommunications`: hasta cinco registros con ID, dirección, asunto, fecha
  real, fechas originales de envío/recepción y registro, proceso (ID/propósito),
  remitente y destinatarios históricos (tipo, dirección original y posición).
- `recipientTotal`: conteo completo, aunque el resumen muestre diez destinatarios.

Sin comunicaciones: indicador false, total cero, última fecha/dirección null,
lista vacía. No se selecciona ni devuelve `bodyOriginal`. El detalle existente
`/communications/:id` conserva el original completo.

Se exige además `communications.read`, la capability común ya existente en los
cuatro roles. No hay permisos de contexto distintos para SENT y RECEIVED ni se
requiere permiso de registrar comunicaciones. Guard y servicio comprueban acceso;
el servicio revalida usuario/rol activo dentro del snapshot RepeatableRead.

## Límites de módulos

Comunicaciones ya depende de Relaciones para participación, actividad y restricciones.
Importar Comunicaciones dentro de RelationshipsModule produciría un ciclo.
RelationshipContextModule monta exclusivamente la consulta existente e importa los
dos módulos. RelationshipsModule conserva sus escrituras y contratos exportados.
RelationshipContextService usa `CommunicationsService.historyForActor(target, tx)`;
no consulta directamente la persistencia de comunicaciones.

Los contratos públicos anteriores por proceso y dirección normalizada se conservan.
`recentByInvolvedAddress` sigue reutilizando la normalización PostgreSQL y los índices
de remitente/destinatario. No se expone una búsqueda global nueva.

## Exactitud institucional

La selección usa el actor principal exacto del proceso. Una organización no hereda
las comunicaciones de su matriz, sucursales ni de procesos personales. Una persona
conserva sus procesos propios, incluso después de adquirir un vínculo institucional.
Las organizaciones con vínculo vigente aparecen separadas, distintas y con conteos
propios; no se propaga su historial al indicador personal ni se suman los conteos.

Direcciones, asunto y remitente proceden de snapshots, nunca de ContactMethod actual.
Tener un correo en el directorio, intención, proceso o vínculo no demuestra una
comunicación registrada. La fecha de orden es `occurredAt DESC, id DESC`; cargar
un correo retrospectivamente no lo convierte en el más reciente.

## Consulta y tamaño

Cada actor exige una selección limitada de comunicaciones y un conteo agregado,
independientemente de cuántos procesos o correos tenga. Prisma carga las relaciones
de los cinco registros por lotes; no hay un ciclo por proceso, correo o destinatario.
Solo se consideran como máximo el actor directo y cinco organizaciones vinculadas.
El filtro VALID usa el estado ya existente, sin inventar invalidaciones de 3.8.

La prueba PostgreSQL compara las consultas SQL de comunicaciones con un registro y
con 1.000 distribuidos entre diez procesos. Verifica cantidad constante (hasta tres
SELECT de comunicaciones/destinatarios), total 1.000, cinco resúmenes, diez
destinatarios visibles y respuesta completa menor de 15 KB para esa fixture.
Ese tamaño medido corresponde a la fixture, no es un límite universal de bytes.

## Interfaz y caché

El panel reutilizable muestra restricción, procesos activos, intenciones planeadas,
comunicaciones, procesos cerrados y organizaciones vinculadas. Distingue Enviada y
Recibida, muestra fecha real, snapshots, proceso y enlaces al detalle, sin cuerpos.
La ausencia de registros se expresa como «No hay comunicaciones registradas en
CECASEM Conecta». La ayuda aclara que el sistema solo muestra comunicaciones
registradas. Un proceso activo sin comunicaciones no se presenta como contacto real.

Solo la restricción activa bloquea el nuevo acercamiento. El historial ordinario
permite guardar una intención/proceso. Una respuesta recibida posterior no levanta
la restricción. Las invalidaciones existentes de comunicaciones, intenciones,
procesos y restricciones refrescan el contexto. La identidad de caché incorpora la
capability común de lectura de comunicaciones y retira datos al perder acceso.

## Pureza y cobertura

GET conserva participantes, versión, actividad, eventos y auditoría; no toma locks
de escritura ni realiza actuaciones. La prueba antes/después incluye comunicaciones
reales y un lector de Planificación ajeno al proceso.

Integración cubre vacío, SENT, RECEIVED, mixtas, retrospectivo, desempate, múltiples
procesos, cuatro roles, organización exacta, persona independiente/vinculada,
restricción y levantamiento, corrección de ContactMethod, dirección normalizada,
límites y pureza. Frontend cubre esos resúmenes, ausencia, loading/error, enlaces,
separación institucional, bloqueo, creación permitida con historia e invalidación
real tras registrar SENT/RECEIVED mediante sus hooks existentes.

No se implementa 3.7. Su conversación/timeline deberá usar los contratos públicos
de procesos y comunicaciones, ordenar hechos por fecha real y mantener distinguibles
las comunicaciones externas y las actuaciones formales.

## Archivos propios de esta entrega

Se preservó el baseline de 109 archivos pendientes en main, HEAD b912383.
Esta entrega modifica 14 de esos archivos y agrega tres, para 112 pendientes.

- `apps/api/src/app.module.ts`
- `apps/api/src/modules/relationships/relationships.module.ts`
- `apps/api/src/modules/relationships/relationship-context.module.ts` (nuevo)
- `apps/api/src/modules/relationships/relationship-context.service.ts`
- `apps/api/src/modules/relationships/relationship-context.dto.ts`
- `apps/api/src/modules/relationships/relationship-context.rules.ts`
- `apps/api/src/modules/communications/communication-history.dto.ts` (nuevo)
- `apps/api/src/modules/communications/communications.service.ts`
- `apps/api/test/relationship-context.integration-spec.ts`
- `apps/web/src/features/relationships/context-contracts.ts`
- `apps/web/src/features/relationships/context-queries.ts`
- `apps/web/src/features/relationships/relationship-context-panel.tsx`
- `apps/web/src/features/relationships/relationship-context.test.tsx`
- `apps/web/src/features/relationships/contact-restrictions.test.tsx`
- `apps/web/src/features/communications/sent-communications.test.tsx`
- `apps/web/src/features/communications/received-communications.test.tsx`
- `docs/subfase-3.4-b-contexto-comunicaciones.md` (nuevo)

## Resultado de validación

Validaciones ejecutadas sobre la entrega:

- `corepack yarn lint`: PASS.
- `corepack yarn typecheck`: PASS.
- `corepack yarn test`: PASS; API 553 pruebas / 35 suites, frontend 434 / 22 archivos.
- `corepack yarn build`: PASS.
- `corepack yarn workspace @cecasem-conecta/api test:integration`: PASS;
  972 pruebas / 21 suites PostgreSQL, 324,416 segundos, en la base aislada `_test`.
- `corepack yarn workspace @cecasem-conecta/api prisma:validate`: PASS.
- `git diff --check` y revisión de whitespace de archivos nuevos: PASS.
- Diff, archivos de ejecución y secretos: revisados; sin hallazgos.

Schema y las 29 migraciones conservan su contenido de entrada. Migraciones nuevas:
NINGUNA. El aviso previo de Vite por chunk mayor de 500 KB continúa; el bundle
principal mide 617,92 KB (170,72 KB gzip). No bloquea el build ni el cierre funcional.
No se detectaron regresiones en las suites ejecutadas. No se ejecutó una revisión
visual manual en navegador; los flujos frontend están verificados con Testing Library.

SUBFASE 3.4-B COMPLETADA.
SUBFASE 3.4 COMPLETADA: SÍ.
Commit realizado: NO. Push realizado: NO.
