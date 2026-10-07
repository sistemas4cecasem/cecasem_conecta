# UI 2.5 — Fichas de organización y persona externa

## Baseline

Rama main; HEAD inicial `41c8124f0a5a3358944c0a755c7c807751945df2`.
Working tree limpio. UI 1 y UI 2.1–2.4 incorporadas en commits.
La entrega inicial se realizó sin commit ni push. El commit posterior fue
autorizado por el usuario.

## Inspección funcional previa

- Organización: consulta de ficha y consulta paginada de sedes, edición mediante
  OrganizationForm, cambio de estado confirmado con expectedVersion, categorías,
  procedencia de importación, consolidación y registros consolidados.
- Persona: consulta de ficha, PersonForm, estado confirmado, contador de vínculos
  y fallback independiente. Contexto institucional previo con gestiones propias y
  de organizaciones vinculadas, comunicaciones registradas y restricciones.
- Ambas: contactos canónicos y asociaciones con contexto propio, episodios,
  verificación por objeto, historial de modificaciones por operaciones y
  coincidencias con comparación y revisión humana.
- Contacts: EMAIL, PHONE, LINKEDIN, FORM, WEB y OTHER; se mantienen los nombres
  existentes Correo, Teléfono, LinkedIn, Formulario, Web y Otro.
- VerificationPanel conserva sus consultas de condición e historial paginado,
  el formulario de evidencia y la distinción entre editar y corroborar.
- PersonRelations mantiene filtros all/current/historical, páginas, episodios
  simultáneos y fechas desconocidas. Corregir y finalizar son flujos distintos.
- Se revisaron contratos, hooks, mutaciones, componentes hijos, formularios
  embebidos, historial, duplicados y pruebas existentes antes de componer.

## Composición

PageHeader con nombre real, contexto Directorio y StatusBadge Activa/Inactiva.
Editar es secondary y el cambio lógico de estado ghost; la confirmación existente
utiliza ConfirmationPanel y conserva advertencia, cancelación, pending y conflicto.
La acción de corroboración tiene prioridad dentro del bloque de verificación.
No se añade una acción nueva de intención, contacto externo o vínculo en organización.

Información institucional/personal con Surface y Metadata. No se inventan ciudad,
tipo u organización principal de persona. Categorías mantienen nombres y condición
inactiva; Sin categorías, Sin matriz y Sin dato conservan su significado.
Creación, modificación y última verificación son conceptos separados, con time
cuando hay fecha real. Se conserva el formato es-BO.

En escritorio desde 1280 px, información y verificación comparten dos columnas.
Contactos ocupan el ancho completo; cada asociación y episodio puede disponer su
contexto y corroboración en dos columnas con divisores. No hay una card por dato,
correo o persona. En tablet/móvil se utiliza una columna y metadata adaptable.

La persona muestra datos, contactos y vínculos antes del contexto extenso de
gestiones. RelationshipContextPanel sigue visible y completo, sin tabs, acordeón,
queries adicionales ni cambios en sus reglas o advertencias de no contactar.
Las posibles coincidencias siguen visibles como sección de revisión con su
porcentaje, señales, permisos y acciones originales. El historial conserva todos
los snapshots, referencias, fuentes, autores inactivos y paginación por operación.

## Reutilización y alcance compartido

Primitivas reutilizadas: PageHeader, Surface, Metadata, StatusBadge, ActionLink,
Button, Alert, ConfirmationPanel, DataList, DataListItem, FormField, Input y Select.
Se conservan QueryState y Pagination del directorio para sus mensajes y errores.
No se modifican components/ui ni se crean componentes de dominio especulativos.

ContactAssociationCard, VerificationPanel y DirectoryHistory reciben opciones
de presentación con defaults anteriores. Solo las fichas activan modern; los
headings de verificación/historial embebidos usan h3 y entradas h4 cuando aplica.
PersonRelations y ContactSection solo se utilizan en estas dos fichas.
Los formularios externos completos de organización/persona permanecen intactos.
Los formularios embebidos conservan RHF/Zod, payloads, confirmaciones y versiones.
FormField mejora la asociación del error de URL de corroboración con su input.
directory-detail.css limita todos sus estilos a .directory-detail.

## QA autenticada y accesibilidad

Ambas fichas comprobadas como Administrador a 1440×900, 768×1024 y 390×844 CSS.
Un h1 por ficha. scrollWidth 1425/753/375 respectivamente, menor o igual al
viewport 1440/768/390: no hay scroll horizontal. Emails y textos largos ajustan;
los botones conservan al menos 44 px, y las acciones del header móvil se apilan.
Se mantienen listas nativas, labels, foco visible y estados con texto.

Se probaron realmente Administrador, Búsqueda, Directorio y Planificación en
ambas fichas. Todas las cuentas demo tienen edición, verificación, contactos,
episodios e historial. Solo Administrador tiene cambio de estado y revisión de
consolidación; los otros tres pueden comparar y descartar coincidencias.
No se confunden esas cuentas con un perfil completamente de solo lectura:
las pruebas sintéticas verifican lectura sin capabilities de mutación para
los cuatro roles, y fichas consolidadas con mantenimiento bloqueado.

Se comprobó navegación entre organización y persona, comparación de coincidencia,
apertura/cancelación de corroboración, confirmación/cancelación de estado,
registro/cancelación de contacto y episodio, y consulta/cierre de historial de
episodio. No se guardaron mutaciones ni se alteraron datos de demo para capturas.
La sesión de Administrador se restaura al terminar.

Evidencia y mediciones locales ignoradas por Git en storage/qa-ui-2.5:

- organizacion-desktop.jpg, organizacion-tablet.jpg, organizacion-mobile.jpg;
- persona-desktop.jpg, persona-tablet.jpg, persona-mobile.jpg;
- organizacion-research.jpg, organizacion-board.jpg, organizacion-planning.jpg;
- persona-research.jpg, persona-board.jpg, persona-planning.jpg;
- persona-verificacion-mobile.jpg y mediciones.json.

Organización demo contiene categoría, contacto, vínculo vigente, historial real
de modificación y coincidencia al 95 %. Persona demo contiene contacto, vínculo
y contexto institucional con proceso y comunicaciones de la organización.
Nunca verificado es el estado disponible en esas fichas demo; revisión pendiente,
autor de corroboración y evidencia histórica se verifican con fixtures en tests.

## Validaciones y límites

Baseline frontend: 717 pruebas aprobadas en 42 archivos.
16 nuevas pruebas de UI 2.5: metadata, categorías inactivas, matriz/sede, contactos
compartidos/antecedentes, episodios actuales e históricos, independiente,
condición/autor/intervalo de verificación, evidencia e historial, snapshots,
consolidado, capabilities de lectura por cuatro roles, cancelar, error accesible
y submit de corroboración con payload/version original.
Frontend final: 733 pruebas aprobadas en 43 archivos. API: 926 en 55 suites.
Total de pruebas aprobadas entre los dos workspaces: 1659.

Lint, typecheck, test y build del frontend y las validaciones root habituales
se ejecutaron correctamente. git diff --check aprobado.
Persiste el aviso previo del bundle principal mayor de 500 kB (aprox. 766 kB).
No hay cambios backend, API, Prisma, contratos, RBAC, capabilities, queries,
mutations, validaciones ni reglas de negocio. No se modifican listados cerrados,
búsqueda, dashboard, shell ni módulos externos.
