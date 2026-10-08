# UI 2.11 — Pantallas transversales y acceso

## Baseline y diagnóstico previo

Rama `main`, HEAD `b90b437f45323b2bbeb9a004d7aeb5f103da1387` (UI 2.10 incorporada). Working tree inicial limpio. Baseline ejecutado: 840 tests frontend aprobados.

Notificaciones conservaba encabezado, selector, botones y filas con estilos anteriores. Su contrato contiene tipo, fecha de generación, lectura y contexto de oportunidad, reunión, proceso o recordatorio. No hay prioridades ni marcado múltiple. La apertura marca lectura cuando corresponde, después navega; consultas y contador se invalidan mediante los hooks existentes y la paginación usa cursor.

Login, primer acceso y restablecimiento conservaban formularios con estilos anteriores. El logo oficial, layout público, colores base y composición ya eran institucionales. El indicador global tiene enlace nativo, foco visible, nombre accesible del contador y adaptación móvil; no necesitó cambios. No se modificó el App Shell ni el layout público.

La recuperación se inicia desde Usuarios por un Administrador. No existe solicitud pública independiente. `/reset-password` establece la nueva contraseña mediante credencial temporal; `/first-access` comparte el formulario. Se orienta al usuario hacia el Administrador y se enlazan ambas rutas existentes desde login, sin nuevas solicitudes o endpoints.

## Implementación visual

- Notificaciones: PageHeader, filtro etiquetado, filas con divisores, título de evento, estado textual, fecha de generación y acciones existentes. Sin leer se distingue también por peso tipográfico y acento. QueryFeedback, EmptyState y LoadMore conservan mensajes, reintento y cursor.
- Autenticación: AuthFormSurface es un componente de presentación local reutilizado por LoginPage y CredentialPasswordForm. Superficie compacta, controles institucionales, Alert y ayudas asociadas a campos.
- Se preservan identificadores y nombres de inputs, tipos, autocomplete, esquema Zod, React Hook Form, handlers, payloads, endpoints, limpieza de contraseñas, extracción y retirada del fragmento URL, navegación, bloqueo ante sesión existente y refetch.
- Los errores inválido/expirado/utilizado mantienen el mensaje uniforme existente. No se inventan estados de token ni reglas de complejidad.
- CSS limitado a las features auth y notifications. Sin dependencias ni cambios en módulos previos, backend, contratos, queries, RBAC o capabilities.

## QA real y límites

Aplicación React real en 127.0.0.1:5173, conectada a la API de demostración existente. No se crearon usuarios, tokens ni datos de QA.

- Login real con cuentas disponibles de Administrador, Directorio, Búsqueda y Planificación; sesión de Administrador restaurada al finalizar.
- Bandejas reales: Administrador 1 sin leer, Directorio 2, Búsqueda 2, Planificación 0; indicador coherente con cada bandeja. Administrador tiene filas leída/no leída; Planificación permite comprobar lista vacía al filtrar No leídas.
- Filtros reales y apertura de una oportunidad ya leída; navegación al detalle confirmada. No se marcaron avisos nuevos como leídos para conseguir evidencia.
- Login, primer acceso, restablecimiento y Notificaciones revisados en 1440×900, 768×1024 y 390×844, sin desbordamiento horizontal. Campos con labels, un h1 por página; navegación por teclado y foco visible comprobados.
- Primer acceso y restablecimiento: presentación sin credenciales y errores locales de formulario vacío. No se introdujeron nuevas contraseñas ni se consumieron credenciales reales.
- Expiración, token inválido/consumido, éxito de establecimiento, rechazo de contraseña, error de red, 401, conflicto de sesión, lectura pendiente y cursor se verifican mediante fixtures/mocks, no como operaciones reales de autenticación.

Capturas locales en `storage/qa-ui-2.11` ignorado: bandeja en tres tamaños, filtros, roles, lista vacía, login, primer acceso, restablecimiento y errores locales. Sin contraseñas ni tokens visibles. No se incorporan al diff.

## Pruebas y validaciones

17 nuevas pruebas: 3 login, 2 primer acceso, 2 restablecimiento y 10 notificaciones. Se ampliaron también las aserciones pending de pruebas previas. Frontend final: 857. API: 926. Total: 1783 aprobadas.

Validaciones web y monorepo: lint, typecheck, test y build aprobados. Diff inspeccionado y `git diff --check` aprobado. Se conserva advertencia de chunk principal superior a 500 kB (773.41 kB); no se optimiza el bundle en esta subfase.

## Cierre

UI 2.11 puede cerrarse en el alcance solicitado, con la advertencia del bundle documentada. No hubo consumo real de credenciales de primer acceso o restablecimiento. Sin commit ni push; no se inicia UI 2.12.
