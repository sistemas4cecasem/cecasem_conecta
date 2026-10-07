# UI 2.4 — Directorio restante y Búsqueda

## Baseline y diferencias funcionales inspeccionadas

main, HEAD `31ea9602d38bf09aa2e12e38ba6b02736840257d`, working tree limpio.
UI 1, UI 2.1, UI 2.2 y UI 2.3 incorporadas. La entrega inicial de esta subfase
se realizó sin commit ni push; el commit posterior fue autorizado por el usuario.

Antes de componer las pantallas se identificaron estas diferencias:

| Pantalla | Estado y consulta | Información disponible | Acciones |
|---|---|---|---|
| Personas /people | Nombre, estado active y página en estado local; búsqueda al escribir | Nombre, estado y currentRelationsCount; no expone organización/cargo | Crear con directory.write; detalle por enlace |
| Búsqueda /directory/search | q, page, includeInactive y filtros organization* en URL; debounce 350 ms | Organizaciones, personas/vínculos, correo canónico/asociaciones, procesos, comunicaciones y antecedentes importados | Enlaces reales; página común según máximo de totales existente |
| Categorías /organizations/categories | Estado active y página locales | Nombre, estado, versión | Crear/editar con directory.write; estado con directory.status.update; historial con directory.history.read |

## Personas externas

PageHeader con contexto Directorio, descripción funcional y creación primaria.
FilterBar únicamente con nombre y estado, manteniendo handlers, defaults y
paginación local. Sin nuevos filtros ni acción de limpieza inexistente.
Surface con total real y DataList compacto. Nombre enlazado, StatusBadge y
Metadata con la síntesis existente de vínculos. No se enriquecen filas con
consultas ni se inventa organización/cargo. Se conserva el fallback independiente.
QueryFeedback y EmptyState preservan mensajes, reintento y vacío.

## Búsqueda global

PageHeader seguido de FilterBar con nombre/correo destacado, checkbox existente
y filtros estructurados específicos de organizaciones. Se mantienen validación,
normalización, debounce, enabled, query key, staleTime, gcTime, signal y retry.
El estado inicial no afirma que no haya resultados; vacío posterior y errores
utilizan EmptyState/QueryFeedback con los mismos mensajes.

Resultados en superficies por tipo, con DataList y nombres enlazados. Se
preservan país/sigla/matriz, vínculos con cargos y organizaciones, consolidados,
correo y asociaciones, procesos/actores/estados y todos los datos históricos.
Las asociaciones de correo siguen sin acreditar comunicaciones realizadas.
Último contacto válido, historia completa, invalidadas y antecedentes importados
mantienen su distinción, fechas, autor, cuerpos, observaciones y origen.
VerificationPanel de antecedentes importados permanece intacto, incluidas sus
consultas existentes; no se añade enriquecimiento visual por API.
La paginación común mantiene el máximo anterior de totales, no una suma nueva.

## Categorías institucionales

Se completa la base de UI 2.1. Creación con Surface, FormField, Input, FormSection,
FormActions y Button, manteniendo RHF/Zod, submit, pending, errores y mutation.
Filtro por estado, resultados con total y listado en superficie común.
Creación lateral en escritorio y apilada en tablet/móvil; lectura sin escritura
no reserva una columna vacía. Edición secondary; historial y cambio de estado
ghost. Desactivar/reactivar son acciones lógicas, no eliminación física.

La activación/desactivación actual es directa: no se inventa ConfirmationPanel.
Se conservan endpoint, PATCH, expectedVersion y manejo de conflicto. Historial
sigue abriendo DirectoryHistory en la misma fila; solo se moderniza su botón y
se añade aria-expanded. La vista compleja de historial permanece sin cambios.

## Ajustes compartidos y navegación

No se modifica OrganizationsPage ni ninguna primitiva de components/ui.
OrganizationFilters de UI 2.3 recibe dos correcciones de presentación necesarias
para su uso modern con prefix: resumen predeterminado Todas en Búsqueda y nombre
“Limpiar filtros de organizaciones”. Organizaciones conserva Activas y su texto.
No cambian keys, filtros, limpieza ni consultas.

MutationError añade modern opcional, usado únicamente por Categorías; conserva
mensajes backend, advertencias, borrador, reintentos y callbacks de recarga.
Los consumidores legacy siguen con su presentación previa. Una prueba cubre
el conflicto real de versión y su recarga explícita.

No se extraen componentes React genéricos nuevos: las primitivas ya cubren la
reutilización. directory-pages.css comparte composición entre las tres páginas,
sin afectar shell, dashboard u organizaciones. No se agregan dependencias.

Se retiran accesos redundantes del cuerpo: Organizaciones del directorio en
Personas, Organizaciones en Búsqueda y Volver al directorio en Categorías.
El destino permanece en sidebar/menú con directory.read. Las pruebas verifican
el acceso global donde las páginas se renderizan dentro del shell.

## Responsive, accesibilidad y QA

Administrador: las tres páginas comprobadas a 1440 x 900, 768 x 1024 y 390 x 844
CSS reales. Mediciones sin scroll horizontal, inputs/selects de 44 px; acciones
móviles de categorías entre 44 y 60 px. Labels, aria-describedby de filtros,
aria-invalid y error asociado en categorías, listas y links nativos, h1 único,
estados textuales y foco institucional.

QA autenticada de las tres páginas con Administrador, Búsqueda, Directorio y
Planificación. Todas las cuentas demo permiten crear personas/categorías, editar
categorías y consultar historial; solo Administrador muestra cambio de estado.
Pruebas con permisos de solo lectura aseguran ausencia de acciones y editor.

Se comprueban navegación a detalle de persona, edición/cancelación de categoría,
historial inline, búsqueda Demo con cinco organizaciones, tres personas y un
proceso; correo exacto demo con asociaciones y dos comunicaciones; búsqueda
vacía e inicial. No se crean/editan/desactivan registros de la demo. Las
mutaciones se validan con mocks. Sesión de Administrador restaurada al final.

Capturas y mediciones en storage/qa-ui-2.4, excluidas de Git. Incluyen las nueve
combinaciones página/resolución, correo, vacío, inicial, edición móvil y
categorías por rol. Capturas completas con desplazamiento vertical cuando aplica.

## Validaciones

696 pruebas frontend antes, 21 nuevas (Personas 4, Búsqueda 2, Categorías 15).
717 aprobadas en 42 archivos. API: 926 aprobadas en 55 suites. Monorepo: 1643.
Lint, typecheck, test y build aprobados; git diff --check aprobado.
Se conserva el aviso conocido del bundle principal mayor de 500 kB.

Sin cambios backend, API, contratos, RBAC, capabilities, reglas, queries,
mutations, filtros ni paginación funcional. Detalles/formularios de personas y
organizaciones, verificación, contactos, episodios y otros módulos sin rediseño.
