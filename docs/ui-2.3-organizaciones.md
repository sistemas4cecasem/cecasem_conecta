# UI 2.3 — Directorio / Organizaciones

## Baseline

Rama main, HEAD `e9dbddfec764a8dd183e005e07620ce4cbeaa89e`, working tree limpio.
UI 1, UI 2.1 y UI 2.2 incorporadas. Antes de comenzar, el usuario autorizó
el commit independiente de UI 2.2: `feat(web): rediseñar el dashboard operativo de CECASEM`.
UI 2.3 se entregó inicialmente sin commit ni push. Posteriormente, el usuario
autorizó su commit convencional en español con resumen y validaciones.

## Jerarquía

OrganizationsPage real utiliza PageHeader con contexto Directorio, título
Organizaciones, descripción funcional y creación primaria condicionada por
directory.write. FilterBar separa el nombre de los filtros estructurados.
Surface presenta el total del backend, los estados de consulta, DataList con
divisores y Pagination. No hay consultas adicionales ni nuevos campos.

Las filas conservan nombre enlazado, país/fallback, estado textual, categorías
y matriz cuando existe. Metadata ordena los datos secundarios; StatusBadge
presenta Activa/Inactiva. Sin sombras ni una tarjeta independiente por fila.

## Filtros y comportamiento

Se conservan nombre, país, estado, condición de verificación, comunicaciones
externas y categoría. El filtro de comunicaciones mantiene la condición conjunta
relationships.process.read y communications.read. FieldHelp conserva íntegra
su explicación y se conecta al selector con aria-describedby.

El nombre sigue actualizando la URL al escribir, sin nuevo debounce o submit.
Cambiar filtros reinicia página 1; paginar conserva criterios. El estado
predeterminado sigue siendo active. Limpiar filtros conserva exactamente el
comportamiento anterior: elimina las cinco claves de organizationFilterKeys,
reinicia página 1 y conserva nombre y parámetros ajenos.

El catálogo de categorías mantiene su consulta, estado local, página, selección
de otras páginas y categorías inactivas. La presentación modern es optativa
para OrganizationsPage; los consumidores de Búsqueda global conservan legacy.
No se duplican consultas ni se descarga todo el catálogo.

El resumen visual refleja los controles existentes. Una categoría recuperada
desde la URL mantiene el fallback anterior “Categoría seleccionada”.

QueryFeedback conserva Cargando…, No se pudo cargar la información. y reintento.
EmptyState mantiene el vacío filtrado. Solo cuando status=all y no hay otros
filtros, total=0 permite afirmar que no hay organizaciones registradas.
Pagination mantiene página, total, tamaño predeterminado 25, disabled y handlers.

## Navegación

Se retiran del cuerpo Búsqueda global, Categorías y Personas externas. Los tres
destinos permanecen en el sidebar y menú móvil con directory.read, el mismo
permiso de acceso de esta página. Una prueba integrada verifica rutas globales
y ausencia de enlaces duplicados dentro de main. Crear conserva /organizations/new.
Formulario de creación, detalle, categorías, personas, búsqueda y shell sin rediseño.

## Corrección necesaria de carga CSS

La apertura de una pestaña nueva reveló que AppRoutes importaba CSS de features
con @layer components antes de styles.css. Esto establecía components antes de
base y permitía que los resets anularan primitivas y estilos institucionales.
Se mueve únicamente import './styles.css' al inicio de main.tsx. No se cambian
estilos ni componentes del shell/dashboard. Tras recarga completa se verifican
h1 de 24 px, Surface con padding de 16 px y texto blanco en la creación primaria.

## Responsive, accesibilidad y QA

QA autenticada: Administrador, Búsqueda, Directorio y Planificación. Las cuatro
cuentas demo tienen directory.write y muestran creación; una prueba con
directory.read sin escritura confirma que no se ofrece la acción. Se verifica
la navegación a creación y cancelación sin guardar, y el acceso a Búsqueda global.

Administrador revisado a 1440 x 900, 768 x 1024 y 390 x 844 CSS, con medición DOM
de dimensiones reales. Sin scroll horizontal. Filtros: cinco columnas a 1440,
tres desde 1280, grid adaptable debajo y una columna en móvil. Controles móviles
de 44 px, metadata apilada, enlaces semánticos y nombres largos legibles.

Se comprueban filtros reales y vacío con nombre inexistente sin modificar datos
institucionales. Capturas en storage/qa-ui-2.3, excluidas de Git: Administrador
desktop/tablet/mobile, Búsqueda desktop, Directorio desktop, Planificación desktop,
filtro por Bolivia y estado vacío. Las capturas completas incluyen el contenido
que requiere desplazamiento vertical.

Primitivas reutilizadas: PageHeader, ActionLink, Button, FilterBar, FormField,
Input, Select, FieldHelp, Surface, DataList, DataListItem, Metadata, StatusBadge,
QueryFeedback, EmptyState y Pagination. Ninguna primitiva compartida modificada.

## Validación

Frontend: 685 pruebas antes, 11 nuevas, 696 aprobadas en 41 archivos.
La batería anterior protege búsquedas, filtros, historial URL, caché por identidad,
catálogo paginado, permisos, estados y navegación; permanece aprobada.
Monorepo: 926 pruebas API y 696 web, 1622 en total.
Lint, typecheck, test y build del frontend y del monorepo aprobados.
git diff --check aprobado. Se conserva el aviso conocido del bundle mayor
de 500 kB. Sin cambios backend, API, contratos, RBAC, capabilities, queries,
mutations, paginación funcional ni reglas de negocio.
