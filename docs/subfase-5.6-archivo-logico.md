# Subfase 5.6 — Auditoría de estados lógicos y conservación

## Baseline auditado

Rama `main`, HEAD `0a0a05e7f192dad7cb99e53248065291801ac603`, 56 migraciones. Los cambios de 5.1–5.5 ya estaban presentes sin commit; esta auditoría los preserva. No se identificó un commit que consolide esas subfases.

## Inventario de entidades

| Entidad | Estado lógico / acción | Reversible | Hard delete funcional | Conservación / permiso |
|---|---|---:|---:|---|
| User | `isActive`; desactivar/reactivar | Sí | No | Autoría y FKs permanecen. Administración; auditoría `USER_DEACTIVATED/REACTIVATED`. |
| Organization | `isActive`; desactivar/reactivar; consolidar como duplicado (`duplicateOfId`) | Estado sí; consolidación no es operación ordinaria reversible | No | Procesos, vínculos, contactos, categorías e historial permanecen. Estado: Administrador (`directory.status.update`); edición de ficha: los cuatro roles. Historial y audit event. |
| Person | `isActive`; desactivar/reactivar; consolidar como duplicado | Estado sí; consolidación no es operación ordinaria reversible | No | Vínculos, contactos, actuaciones e historial permanecen. Permisos y auditoría como organización. |
| PersonOrganizationRelation | `isCurrent`; finalizar vínculo, crear otro episodio | No se reactiva el episodio; puede crearse otro | No | Todos los episodios persisten con historial/auditoría; escritura de directorio. |
| ContactMethod | `USABLE/UNUSABLE`; marcar no utilizable/restablecer condición | Sí | No | Medio, asociaciones y usos históricos permanecen. Cambio de condición tiene historial y audit event. La matriz exige los cuatro roles; antes de 5.6 era solo Administrador (corregido en esta subfase usando `directory.write`). |
| PersonContact / OrganizationContact | `isActive`; finalizar/reactivar asociación | Sí | No | Asociación, contexto y versiones anteriores permanecen. Historial y auditoría; edición de directorio. Estado se habilita a los cuatro roles según matriz (corregido en esta subfase). |
| Category / OrganizationCategory | Categoría `isActive`; desactivar/reactivar; asociación se ajusta al editar ficha | Estado sí | No | Cambios de asociaciones guardan referencias anteriores/nuevas en `DirectoryChange`; estado reservado a Administrador. |
| ContactIntent | `ACTIVE/CANCELLED/CONVERTED/CLOSED`; cancelar/convertir/cerrar por estado de negocio | No se reabre | No | Registro y evento de auditoría se conservan; acción con permiso de intención y autoría/contexto. |
| DuplicateCandidate / DuplicateReconciliation | `PENDING/NOT_DUPLICATE/CONSOLIDATED`; descartar/consolidar | Descartar/consolidar no es reversible ordinariamente | No | Evidencia y referencias del principal/duplicado permanecen. Consolidar: Administrador; decisión registrada en auditoría. |
| RelationshipProcess / ProcessParticipant / RelationshipProcessEvent | Estado de proceso; cerrar/reabrir; participación formal | Cierre reversible mediante reapertura autorizada | No | Eventos, participantes, comunicaciones, reuniones, oportunidades, archivos y auditoría permanecen. Cierre/reapertura usa `processAuthority`: Directorio institucional y otros roles sujetos a participación/contexto. |
| ContactRestriction | `ACTIVE/LIFTED`; levantar con motivo | No se vuelve a activar; se registra otra restricción | No | Restricción y razón de levantamiento con audit event. Administrador/Directorio según permiso. |
| Communication / CommunicationRecipient / CommunicationAmendment | `VALID/INVALIDATED`; corrección/anotación/invalidez append-only | Invalidación no se revierte | No | Original, recipients, correcciones, anotaciones e invalidación siguen visibles en timeline. Permisos contextuales y audit event al invalidar. |
| Opportunity / OpportunityOrganization / OpportunityEvent | `PENDING_REVIEW`, `PREPARING`, `SUBMITTED`, `DISCARDED`, `FINISHED`; descartar/finalizar/transicionar | Según transición permitida; no hay restauración genérica | No | Eventos guardan cambios y estados. Al editar organizaciones se quitan/reponen solo asociaciones reemplazables, con anterior/siguiente en evento dentro de la misma transacción. Permisos de oportunidad. |
| Meeting / MeetingParticipant / MeetingAgreement / MeetingEvent | `SCHEDULED/COMPLETED/CANCELLED`; completar/cancelar | Terminales | No | Participantes, acuerdos, enlaces a proceso/oportunidad, archivos y snapshots/eventos permanecen. Permisos de reunión. |
| FileUpload / FileAttachment | Sin estado de archivo lógico para borrado de adjunto | N/A | No en API/UI ordinarias | Metadatos, FKs y bytes asociados permanecen. `reconcile(..., remove=true)` solo retira bytes huérfanos sin `FileAttachment`, como mantenimiento manual; no existe ruta funcional para ello. Temporales de cargas fallidas se descartan. |
| DataImportBatch / DataImportRow / ImportedHistoricalRecord | Lote `ANALYZED/IMPORTED/FAILED`; filas `READY/NEEDS_REVIEW/INVALID/IMPORTED/IGNORED` | Sin borrado/archivo | No | Trazabilidad del lote, valores de origen y referencias importadas persistentes; auditoría de aplicación/fallo. |
| Referral / Verification / DirectoryChange / AuditEvent | Hechos append-only | N/A | No | Referencias, snapshot/actor y eventos persistentes; no existe endpoint ordinario de borrado. |
| Notification / NotificationDelivery / ReminderOccurrence / NotificationCheckpoint | Lectura/entrega/checkpoint y ocurrencias | Lectura no destructiva | No | Persisten como registro interno; no hay borrado funcional ordinario. |
| EmailAccount / UserEmailAccount | Cuenta activa; asignación retirada mediante `removedAt` | Sí | No | `DELETE /users/:id/email-accounts/:emailAccountId` ejecuta baja lógica y registra `MAILBOX_REMOVED`; no elimina la cuenta ni historia de comunicaciones. Solo administración. |
| UserSession / FirstAccessToken / PasswordResetToken | Expiración/revocación | Revocación según entidad | No en flujo de negocio | Datos técnicos de autenticación, distintos de historia institucional; accesos controlados por auth. |

Los nombres de estados se refieren a enums/campos del schema actual. Estados terminales como `CLOSED`, `DISCARDED`, `FINISHED`, `CANCELLED` y `CONVERTED` son transiciones propias del dominio, no un `ARCHIVED` genérico.

## Auditoría explícita de DELETE y cascadas

- **Endpoints `@Delete`:** solo `DELETE /users/:id/email-accounts/:emailAccountId`. La implementación actualiza `UserEmailAccount.removedAt` y registra `MAILBOX_REMOVED`; es desvinculación lógica de configuración, no hard delete.
- **Prisma `delete/deleteMany` en runtime:** no hay llamadas Prisma a `delete()`. `OrganizationCategory.deleteMany` reemplaza una relación editable y su operación registra referencias previas/nuevas en `DirectoryChange`, transaccionalmente. `OpportunityOrganization.deleteMany` reemplaza asociaciones editables y conserva el diff anterior/siguiente en `OpportunityEvent`, transaccionalmente.
- **Otros `delete`:** `Map.delete` retira claves temporales de memoria; no persiste datos. `LocalFileStorage.discard/unlink` elimina bytes temporales de carga fallida o candidatos físicos sin metadata/adjunto, nunca un archivo referenciado en `FileAttachment`; la reconciliación destructiva es explícita y manual. Los borrados Prisma encontrados en suites de integración son limpieza de fixtures, no código de aplicación.
- **Cascadas:** schema no contiene `onDelete: Cascade` ni `onDelete: SetNull`; las relaciones de negocio revisadas declaran `Restrict`. No se halló ruta funcional DELETE para organización, persona, vínculo, medio, proceso, comunicación, oportunidad, reunión, adjunto o lote de importación.
- **Frontend:** no se encontró acción para eliminar permanentemente registros de negocio. “Finalizar asociación”, “No utilizable”, “Desactivar”, “Cerrar”, “Descartar”, “Cancelar” y “Levantar restricción” son mutaciones lógicas auditadas según su dominio.

## Brecha y decisión de 5.6

`ContactMethodsController.condition`, los estados de asociaciones de contacto y sus controles UI exigían `directory.status.update`, disponible únicamente para Administrador. La matriz de esta subfase establece que los cuatro roles pueden cambiar estados de contacto con auditoría. Se asigna `directory.write` a esas tres operaciones; no se amplía `directory.status.update` para desactivar organizaciones, personas o categorías. Esta distinción evita convertir un permiso de mantenimiento de contacto en facultad general de archivo.

No se añade estado `ARCHIVED`, tabla de papelera, política de retención ni migración. Las entidades existentes ya tienen estados de dominio que retiran elementos del trabajo operativo sin borrar relaciones.
