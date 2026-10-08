# UI 2.10 — Importación y exportación Excel

## Alcance y baseline

Rediseño visual de `/admin/imports` y `/admin/exports`, conservando sus operaciones y permisos. Baseline: rama `main`, HEAD `9f7e1937aaff80192ea1b08ec1ae1007742b41e9`, working tree limpio y 815 tests frontend aprobados. No se modificaron backend, API, contratos, autenticación, RBAC, capabilities ni reglas de negocio.

## Presentación

Se reutilizan PageHeader, Surface, FormField, Input, Select, FormSection, FormActions, Button, Alert, StatusBadge, DataList, DataListItem, Metadata y FieldHelp. El CSS se limita a `.data-exchange-page` dentro de la feature. No hay componentes compartidos nuevos.

Importación separa selección, mapeo, lotes anteriores y revisión/resultado. Muestra nombre y tamaño del archivo, origen de columnas, destino y campos obligatorios existentes. Preserva asignación única de columnas, valores sin asignar, reseteos, números de fila, advertencias, errores, coincidencias, decisiones y confirmación explícita. No se presenta una importación parcial como éxito de todas las filas.

Exportación conserva Organizaciones, Contactos, Procesos y Oportunidades; sus filtros y valores iniciales. Mantiene cálculo explícito, invalidación del resumen al cambiar parámetros, bloqueo de descarga sin resultados, generación XLSX y liberación de la URL temporal. Las validaciones del servidor y el máximo de 20 MB permanecen sin cambios.

## Evidencia y límites

QA autenticado contra la API de demostración existente, desde Vite en 127.0.0.1:5173 con proxy de ejecución a 127.0.0.1:8087. No se escribió configuración local al repositorio ni se preparó/restableció la base de datos.

- Administrador: selección e inspección real de un XLSX ficticio de dos filas y tres columnas; mapeo de nombre y país; lectura de lotes preexistentes analizados e importados.
- No se crearon previews reales ni se confirmaron importaciones reales. La creación y confirmación se validaron con fixtures/mocks y las pruebas existentes.
- Exportación real: resumen de cinco organizaciones activas, descarga `cecasem-organizations-2026-10-08.xlsx` y apertura con ExcelJS. Hojas: Organizaciones (6 filas incluida cabecera), Categorías (2) y Medios de contacto (3).
- Directorio, Búsqueda y Planificación: sesiones reales; no aparece enlace de importación y sí los cuatro conjuntos exportables según sus permisos actuales. La denegación de importación sin capability y subconjuntos de permisos se cubren también con tests.
- Revisados selección, mapeo, revisión de lotes y los cuatro formularios exportables en escritorio 1440×900, tablet 768×1024 y móvil 390×844. Sin desbordamiento horizontal; etiquetas vinculadas y una cabecera h1 por pantalla. Uso de teclado con foco visible y estados pendientes accesibles.

Las capturas y archivos de QA permanecen en almacenamiento local ignorado, fuera del diff. No contienen datos de producción.

## Validaciones

25 pruebas frontend nuevas: 14 de importación y 11 de exportación. Pruebas de estas pantallas: 11 previas, 36 finales. Frontend completo: 840; API: 926; total: 1766, todas aprobadas.

Ejecutados y aprobados `yarn lint`, `yarn typecheck`, `yarn test`, `yarn build` y sus equivalentes del workspace web. `git diff --check` aprobado. El build mantiene advertencia por chunk principal mayor de 500 kB (774.57 kB); no bloquea y no se abordó fuera del alcance visual.

## Cierre

UI 2.10 puede cerrarse dentro del alcance visual, con la advertencia del bundle documentada. No hubo importación real ni cambios funcionales. Sin commit ni push.
