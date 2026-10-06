# Subfase 5.3 — Dashboard

`GET /api/v1/dashboard` devuelve una proyección de lectura calculada desde PostgreSQL. No persiste métricas ni introduce caché, entidades, migraciones o estados nuevos. El servicio verifica la identidad activa y selecciona la proyección con el rol/capabilities de esa identidad, nunca con parámetros del cliente. Cada respuesta se obtiene dentro de una transacción `REPEATABLE READ`, de modo que conteos y listados comparten una misma instantánea.

## Semánticas

- Procesos activos: estado distinto de `CLOSED`. Esperando respuesta: `WAITING_RESPONSE`, subconjunto de activos.
- Oportunidades y postulaciones: se mantienen los estados de `OpportunityStatus`. `PENDING_REVIEW` se presenta como pendiente de revisión/nueva; `SUBMITTED` representa una postulación aún pendiente de resolución, porque la oportunidad sigue en ese estado hasta `FINISHED` o `DISCARDED`.
- Reunión próxima: estado `SCHEDULED` y `scheduledAt` posterior al instante de consulta. La comparación usa el instante almacenado con zona (`timestamptz`); la zona IANA se conserva y se usa al presentar la fecha local. Reuniones canceladas, completadas y con fecha pasada quedan excluidas.
- Directorio institucional: cuenta organizaciones activas con condición `REVIEW_DUE` y `NEVER_VERIFIED` usando la misma regla de última verificación, versión del objeto y meses institucionales configurables que el Directorio.
- Búsqueda: procesos activos creados por el usuario o con participación formal; intenciones `ACTIVE` de su autoría; recordatorios persistidos no leídos para los que el proceso siga abierto o la intención siga activa. No se fabrica un indicador único de pendientes.
- Planificación: cuenta oportunidades `PENDING_REVIEW` y `PREPARING`; lista fechas civiles desde hoy UTC hasta 30 días, excluyendo `DISCARDED` y `FINISHED`. El vencimiento no altera estados. Incluye reuniones futuras ligadas a oportunidades o a procesos fuente de oportunidades.

## Rendimiento y navegación

Las lecturas tienen un número fijo de consultas por proyección: institucional aproximadamente 9 SELECT/COUNT (incluye identidad y settings), Búsqueda 7 y Planificación 6. Los conteos y sus listados comparten filtros y cada lista está limitada a cinco filas. Las consultas usan filtros/indexes actuales de estado, fechas, creador/participante y destinatario; no se agregó índice ni migración.

Las tarjetas llevan a rutas existentes; los selectores ya presentes de procesos, oportunidades e intenciones ahora leen el estado desde la URL para que los enlaces filtrados del panel se apliquen al abrirlos. Las reuniones, oportunidades, procesos e intenciones listados enlazan directamente al detalle existente.
