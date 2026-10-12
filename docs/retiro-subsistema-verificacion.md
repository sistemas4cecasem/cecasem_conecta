# Retiro del subsistema de verificación

**Estado vigente desde:** 12 de octubre de 2026

**Decisión:** el sistema ya no solicita ni ofrece verificación para organizaciones, personas, vínculos, asociaciones de contacto o antecedentes importados.

## Comportamiento vigente

El registro, consulta, edición, búsqueda, importación, exportación y consolidación funcionan sin un estado ni un procedimiento de verificación. No hay rutas API, permisos, controles, métricas del dashboard, filtros, columnas de exportación ni configuración de intervalos para esta función.

La procedencia de importación, las fuentes y observaciones opcionales de vínculos y asociaciones, el historial general de cambios y la auditoría institucional siguen activos con sus reglas propias.

## Retención de datos

La migración `20261012120000_archive_verification_subsystem` es hacia adelante y renombra las estructuras existentes sin borrar ni convertir filas:

- `Verification` pasa a `HistoricalVerification`.
- `VerificationSettings` pasa a `ArchivedVerificationSettings`.
- Los seis campos `lastVerifiedAt` pasan a llamarse `legacyLastVerifiedAt`.
- `ContactMethod.valueVersion` pasa a llamarse `legacyValueVersion`.

Las tablas y columnas archivadas siguen en PostgreSQL para preservar datos que puedan existir en otros entornos. Prisma las marca como ignoradas para las consultas de la aplicación; no forman parte de los contratos, respuestas ni flujos activos. Los campos originales de `AuditEvent`, incluido el enum histórico de configuración, se conservan para que los eventos previos sigan siendo legibles y válidos.

No se cambian `DirectoryChange`, el historial de comunicaciones, las versiones usadas para concurrencia, fechas de creación/actualización ni la procedencia de importación. Las migraciones anteriores permanecen intactas.

## Contexto documental

Los documentos de fases anteriores describen la implementación que existió en esas fases. Este documento y el esquema/migración actuales describen el comportamiento vigente tras la decisión de retiro.
