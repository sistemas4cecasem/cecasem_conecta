# Subfase 3.4-A — Advertencias previas y contexto institucional

## Baseline y alcance

Implementada sobre `main`, HEAD `b912383a0874e4519f3a27aade9a712da32f319c`, con
66 archivos pendientes de 3.2/3.3/3.9 conservados. El baseline validado tenía 497
pruebas API, 367 frontend y 852 PostgreSQL. No se realizó commit ni push.

Esta entrega informa sobre gestiones registradas; no crea una entidad Warnings,
no almacena proyecciones y no implementa comunicaciones ni otros módulos futuros.
Subfase 3.4 completada: NO. Los antecedentes de comunicaciones dependen de 3.5/3.6.

## Contrato de lectura

`GET /api/v1/relationship-context?organizationId=<uuid>` o `?personId=<uuid>`.
Exige exactamente uno; UUID inválidos, ninguno, ambos y parámetros ajenos producen
400. Objetivo inexistente: 404; sesión ausente: 401; sin autorización: 403.
La respuesta lleva `Cache-Control: no-store`.

Se reutilizan las capabilities de lectura `directory.read`, `relationships.intent.read`,
`relationships.process.read` y `relationships.restriction.read`, presentes en los cuatro
roles actuales. Guard y servicio comprueban autorización; el servicio lee usuario/rol
actual dentro de la transacción. No se requieren permisos de creación o modificación.

Cada contexto de actor contiene:

- `target`: identidad, nombre y estado de la ficha.
- `restriction`: restricción ACTIVE del actor exacto o null, mediante la interfaz pública de 3.9.
- `contactAllowed`: ausencia de restricción propia, sin sustituir las demás reglas de creación.
- `activeIntents`: lista resumida y conteo de ACTIVE.
- `activeProcesses`: lista resumida y conteo de estados distintos de CLOSED.
- `recentClosedProcesses`: lista resumida y conteo de CLOSED.
- `hasRelationshipHistory`: existe alguna intención o proceso del actor, incluidos históricos.
- `hasRegisteredCommunicationHistory`: siempre false mientras no existan comunicaciones.

Los conteos son totales por actor, aunque las listas contengan como máximo cinco elementos.
Las listas activas se ordenan por última actividad e ID descendentes; los procesos cerrados
por cierre, última actividad e ID descendentes. Se seleccionan contratos públicos mínimos,
sin actuaciones, participantes ilimitados, contraseñas, datos privados de usuarios ni cuerpos
de comunicaciones. Autores/creadores conservan identidad y estado activo/inactivo.
Las intenciones canceladas o convertidas no se muestran activas; su proceso no se duplica.

## Persona y organización

`relatedOrganizationContext` contiene hasta cinco organizaciones con vínculos vigentes,
distintas y ordenadas por nombre/ID, junto con su conteo total. La nueva lectura pública
`DirectoryTargetService.currentOrganizationContext` obtiene esta información dentro del
Directorio. Relationships no accede a su persistencia privada.

El contexto directo de la persona permanece separado del de cada organización. Un mismo
proceso pertenece a un solo grupo. No se incluyen vínculos finalizados, matrices ni sedes
por inferencia. Fichas inactivas permanecen legibles para conservar el contexto histórico.

Las flags y conteos de cada grupo corresponden exclusivamente a su actor. Por ejemplo,
una persona sin proceso propio puede tener `hasRelationshipHistory: false` y mostrar una
organización con procesos. Una restricción institucional no se propaga a la persona.
Consultar una persona vinculada no la habilita como actor independiente: los casos de uso
de creación siguen validando el objetivo por las reglas vigentes del Directorio.

## Semántica y atomicidad

- Información: antecedentes cerrados; no bloquean nuevos objetivos.
- Advertencia: intenciones y procesos activos; ayudan a coordinar gestiones paralelas.
- Bloqueo crítico: únicamente una restricción ACTIVE de no contacto para el actor exacto.

La lectura usa una transacción RepeatableRead normal, sin advisory locks, bloqueos de filas
ni llamada a `requireUsable`/`assertContactAllowed`. No incorpora participantes, actualiza
actividad/versiones, crea eventos ni genera auditoría de negocio.

La consulta puede quedar desactualizada después de responder. Registro de intención,
creación directa y conversión siguen revalidando autoritativamente en 3.9. El test de
restricción posterior comprueba que una respuesta previa `contactAllowed: true` no evita
el rechazo HTTP 409 de la operación protegida.

## Frontend y caché

`RelationshipContextPanel` se integra en los formularios de creación de intención/proceso
y en la ficha de persona para consultar vínculos institucionales. Los formularios comparten
la query con el panel, sin duplicar requests. Solo la restricción impide enviar; los procesos
paralelos no requieren confirmación modal. Se conservan borradores ante un 409 tardío.

El panel presenta carga, error con reintento, vacío, enlaces y límites explícitos. Distingue
información, advertencia y bloqueo mediante texto y estilo; no depende solo del color.
Explica que las gestiones no demuestran comunicaciones externas. Un objetivo nuevo no
arrastra el contexto anterior.

La clave incluye identidad, rol, permisos de lectura relevantes y tipo/UUID del objetivo.
Se cancela y elimina al retirar identidad/permisos. Las mutaciones de intenciones,
conversión, procesos y restricciones invalidan contexto; las del Directorio también lo
invalidan para actualizar nombres, estados y vínculos. Un levantamiento confirmado
elimina el NO CONTACTAR obsoleto después de consultar de nuevo.

## Migraciones y siguiente entrega

Migraciones de esta subfase: NINGUNA. Schema, las 25 migraciones existentes y dependencias
permanecen iguales al baseline.

3.5 necesita registrar comunicaciones enviadas reales: proceso, remitente/destinatarios,
buzón CECASEM, contenido original, fecha real y registrador, con autorización, participación
formal, trazabilidad y revalidación de restricciones. El envío permanece en el proveedor
externo. Esta entrega no implementa 3.5.

## Validaciones ejecutadas

- `corepack yarn lint`: correcto.
- `corepack yarn typecheck`: correcto.
- `corepack yarn test`: 32 suites API / 505 pruebas y 20 archivos frontend / 394 pruebas.
- `corepack yarn build`: correcto en ambos workspaces.
- Integración PostgreSQL completa: 19 suites / 877 pruebas aprobadas.
- Total: 1776 pruebas; 60 nuevas (8 unitarias, 25 de integración y 27 de frontend).
- Prisma validate: schema válido; migrate status: las 25 migraciones de desarrollo aislado al día.
- Schema y migraciones sin cambios respecto al baseline; sin dependencias nuevas.
- Diff incremental, archivos nuevos y revisión de secretos realizados.
- `git diff --check`, incluyendo archivos sin seguimiento: correcto.

Sin regresiones detectadas. Observaciones no bloqueantes: Vite informa bundle principal
de 594,04 kB minificado (166,46 kB gzip); Jest/pg mantienen los avisos presentes en las
validaciones previas. Los escenarios de fallo deliberado producen logs 500 esperados.
No se ejecutó revisión visual manual en navegador ni Docker build; no cambió infraestructura.

## Archivos de esta subfase

- `apps/api/src/modules/directory/directory-target.service.ts`
- `apps/api/src/modules/relationships/relationships.module.ts`
- `apps/web/src/app/layout/authenticated-layout.tsx`
- `apps/web/src/features/directory/person-detail-page.tsx`
- `apps/web/src/features/directory/queries.ts`
- `apps/web/src/features/relationships/contact-intent-create-page.tsx`
- `apps/web/src/features/relationships/queries.ts`
- `apps/api/src/modules/relationships/relationship-context-error.filter.ts`
- `apps/api/src/modules/relationships/relationship-context.controller.ts`
- `apps/api/src/modules/relationships/relationship-context.dto.ts`
- `apps/api/src/modules/relationships/relationship-context.rules.spec.ts`
- `apps/api/src/modules/relationships/relationship-context.rules.ts`
- `apps/api/src/modules/relationships/relationship-context.service.ts`
- `apps/api/test/relationship-context.integration-spec.ts`
- `apps/web/src/features/relationships/contact-restrictions.test.tsx`
- `apps/web/src/features/relationships/context-contracts.ts`
- `apps/web/src/features/relationships/context-queries.ts`
- `apps/web/src/features/relationships/process-queries.ts`
- `apps/web/src/features/relationships/relationship-context-panel.tsx`
- `apps/web/src/features/relationships/relationship-context.test.tsx`
- `apps/web/src/features/relationships/relationship-process-create-page.tsx`
- `apps/web/src/features/relationships/restriction-queries.ts`
- `docs/subfase-3.4-a-contexto.md`
