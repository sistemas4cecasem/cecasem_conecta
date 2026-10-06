# Subfase 5.5 — Exportación Excel

La exportación es una proyección de lectura dentro de `data-exchange/export`, generada bajo demanda con ExcelJS. No crea archivos persistentes ni tablas, migraciones o perfiles compatibles con libros históricos.

## Alcance y filtros

La API expone un preview de conteo y una descarga por dominio bajo `/api/v1/data-exchange/exports`. La descarga procesa todos los resultados que coinciden con los filtros, aunque el listado original use paginación. No se ofrece selección masiva por IDs. Si el preview cuenta cero resultados, la interfaz no habilita descarga y el endpoint rechaza una descarga vacía con 422.

- **Organizaciones:** nombre, país, categoría, estado, condición de verificación y presencia de comunicaciones.
- **Contactos:** personas filtradas por nombre/estado, sus medios asociados filtrables por tipo y sus vínculos institucionales filtrables por vigencia.
- **Procesos:** estado, organización/persona objetivo y creador.
- **Oportunidades:** estado, organización y proceso.

Cada endpoint requiere el permiso de lectura del dominio. Directorio, Búsqueda y Planificación exportan mediante los mismos permisos de consulta que ya poseen; exportar no introduce una capacidad general adicional. La autenticación continúa usando la cookie de sesión.

## Estructura y seguridad

Los libros tienen encabezados institucionales, autofiltro y encabezado congelado. Relaciones de categorías, medios de contacto, participantes y organizaciones de oportunidades se representan en hojas separadas cuando hay filas para evitar duplicados en las hojas principales. Contactos significa personas externas, medios vinculados a esas personas y sus vínculos con organizaciones; los medios institucionales asociados directamente a una organización aparecen en la exportación de organizaciones.

Las celdas textuales se escriben como texto literal, sin fórmulas ni hyperlinks. Las fechas civiles se exportan como `YYYY-MM-DD`; los timestamps conservan UTC ISO-8601. Los valores nulos son celdas vacías. Procesos omiten comunicaciones completas, CCO y notas internas; oportunidades incluyen solo el identificador de la comunicación de origen. No se exportan adjuntos, rutas, sesiones, hashes ni datos de seguridad.

No se añade auditoría para estas lecturas: el flujo actual persiste auditoría de cambios de negocio; RF-79 no requiere registrar una copia ni un evento por cada descarga. Los nombres de archivo son fijos por dominio y fecha local de Bolivia. `Content-Disposition`, `Content-Type`, `Cache-Control: no-store` y `nosniff` se establecen en la respuesta.

## Procesamiento

Las consultas de exportación proyectan solo los campos aprobados y trabajan en lotes de 500 filas. Relaciones se obtienen con selecciones anidadas, no con una búsqueda por fila. El XLSX se materializa en memoria durante la solicitud y se transmite sin guardarlo. En PostgreSQL QA, una exportación de 2.000 organizaciones tardó 948 ms, generó 111.010 bytes y registró una diferencia aproximada de heap de 31.979.936 bytes durante la solicitud; la carga usó lotes de 500. La medición de memoria es una lectura puntual del proceso de pruebas Node, no un límite de heap.
