# UI 2.12 — Auditoría final del frontend

## 1. Objetivo y alcance

Auditar el frontend React real y su integración tras UI 1 y UI 2.1–2.11. Incluye rutas, formularios, detalles, navegación, capabilities, responsive, accesibilidad, pruebas y compilación. Se permiten únicamente correcciones pequeñas y demostradas.

No certifica despliegue productivo, infraestructura, seguridad integral del backend ni conformidad WCAG completa. No se modifican backend, API, Prisma, base de datos, contratos, autenticación, RBAC, capabilities, payloads, validaciones ni reglas de negocio. No se instalan dependencias.

**Veredicto: REDISEÑO FRONTEND LISTO PARA CIERRE CON OBSERVACIONES P3.** No se identificaron P0/P1 en la cobertura ejecutada. F01, F02 y F03 (P2) están corregidos y comprobados. No se certifica conformidad WCAG AA total.

## 2. Baseline y reproducibilidad

- Rama: `main`.
- HEAD: `83b8a34536547b77db17ab5b842c3d532c444e1f`.
- Working tree inicial limpio.
- UI 2.11 y etapas anteriores verificadas en el historial de Git.
- Referencia local `origin/main`: mismo HEAD; comparación 0 commits adelante / 0 atrás. No se ejecutó fetch ni push; no se afirma una comprobación nueva del servidor remoto.
- Leídos AGENTS raíz, web y API; no hay otros AGENTS en el repositorio.
- Baseline ejecutado: lint, typecheck, test y build del monorepo aprobados; frontend 857 en 44 archivos, API 926 en 55 suites, total 1783.
- Runtime: Node 24.21.0, Yarn 4.18.1.
- Versiones declaradas: React 19.3.0, React Router 8.4.0, Vite 8.3.1, TypeScript 6.0.3, TanStack Query 5.104.0, React Hook Form 7.89.0, Zod 4.6.5, Tailwind 4.3.3, Vitest 5.0.3, NestJS 12.1.1 y Prisma 7.10.0.
- Navegador: aplicación en 127.0.0.1:5173, API de demostración existente mediante el proxy de ejecución a 127.0.0.1:8087. No se preparó ni reinició la base de datos.

## 3. Metodología

A. Inventario contrastado con AppRoutes, navegación y gates de features; 38 definiciones de rutas, incluido el fallback.

B. Revisión de código, suites completas, navegación real, comprobaciones DOM y capturas representativas. Los datos demo existentes se consultan; no se fabrican relaciones ni permisos.

C. Correcciones: exponer el estado CLOSED existente en el selector y devolver foco tras cancelar desactivación de organización. Pruebas escritas primero: fallaban antes, pasan después.

D. Reauditoría real y suites completas de monorepo y web tras ambas correcciones.

Niveles de evidencia: **C** código; **T** tests; **N** navegación real; **V** captura; **O** operación real. N/V no significan que se haya ejecutado una escritura. Las confirmaciones y cambios de datos se protegen mediante T; no se ejecutan contra los datos demo.

## 4. Inventario de pantallas

A = Administrador; D = Directorio; B = Búsqueda; P = Planificación; Todos = A/D/B/P. Los roles representan la configuración actual contrastada con gates y QA; una acción contextual puede quedar bloqueada aunque exista la capability general. R = revisada realmente en tres tamaños (N/V y comprobaciones DOM); L = controles legacy residuales, no bloqueo visual. Prioridad A/M indica prioridad de revisión, no severidad.

| Módulo | Ruta | Pantalla | Capability/gate | Roles | Componentes principales | Estado / prioridad |
|---|---|---|---|---|---|---|
| Acceso | `/login` | Login | Sin sesión; redirige si existe | Público | AuthFormSurface, FormField, Alert | R, coherente / A |
| Acceso | `/first-access` | Primer acceso | Credencial temporal; sesión bloquea consumo | Público | CredentialPasswordForm | R sin credenciales / A |
| Acceso | `/reset-password` | Nueva contraseña | Credencial de Administrador; sesión bloquea consumo | Público | CredentialPasswordForm | R sin credenciales / A |
| Transversal | `*` | Ruta inexistente | Layout público | Público | NotFoundPage | R / M |
| Inicio | `/` | Dashboard por capabilities | Sesión; datos según permisos | Todos | PageHeader, MetricCard, listados | R, cuatro variantes / A |
| Directorio | `/organizations` | Organizaciones | directory.read | Todos | PageHeader, FilterBar, DataList | R / A |
| Directorio | `/organizations/new` | Crear organización | directory.write | Todos | OrganizationForm, Field | R, L / A |
| Directorio | `/organizations/categories` | Categorías y mantenimiento inline | directory.read; write para editar | Todos | PageHeader, formularios, DataList | R / M |
| Directorio | `/organizations/:id` | Ficha y edición inline | directory.read; write/status/verify según acción | Todos; estado A | Surface, ContactSection, VerificationPanel | R; foco corregido / A |
| Directorio | `/people` | Personas externas | directory.read | Todos | PageHeader, FilterBar, DataList | R / A |
| Directorio | `/people/new` | Crear persona | directory.write | Todos | PersonForm, Field | R, L / A |
| Directorio | `/people/:id` | Ficha de persona | directory.read; acciones según capabilities | Todos | Surface, PersonRelations, contexto | R / A |
| Directorio | `/contact-methods/:id` | Medio canónico y asociaciones | directory.read; write para corrección | Todos | ContactDetailPage, asociaciones, historia | R, L / A |
| Directorio | `/directory/search` | Búsqueda global | directory.read; contexto según permisos | Todos | PageHeader, FilterBar, resultados | R; búsqueda real / A |
| Relaciones | `/contact-intents` | Intenciones | relationships.intent.read | Todos | PageHeader, DataList, Pagination | R; CLOSED corregido / A |
| Relaciones | `/contact-intents/new` | Crear intención | relationships.intent.create | Todos | TargetPicker, contexto, Field | R, L / A |
| Relaciones | `/contact-intents/:id` | Intención y conversión | relationships.intent.read; canCancel/canConvert | Todos, contexto | IntentContext, acciones, contexto | R / A |
| Relaciones | `/relationship-processes` | Procesos | relationships.process.read | Todos | PageHeader, filtros, DataList | R / A |
| Relaciones | `/relationship-processes/new` | Crear proceso | relationships.process.create | Todos | TargetPicker, contexto, Field | R, L / A |
| Relaciones | `/relationship-processes/:id` | Detalle, timeline, adjuntos y participantes | relationships.process.read; reglas contextuales | Todos | PageHeader, Timeline, Surface, Attachments | R con desplazamiento / A |
| Comunicaciones | `/relationship-processes/:id/communications/sent` | Registro enviado | communications.sent.create y process.read; buzón habilitado | Todos según buzón | SentForm, Field, contexto | R; formulario con B, L / A |
| Comunicaciones | `/relationship-processes/:id/communications/received` | Registro recibido | communications.received.create y process.read | Todos | ReceivedForm, Field, contexto | R, L / A |
| Comunicaciones | `/communications/:id` | Detalle enviado/recibido | communications.read; acciones adicionales por permiso | Todos | Surface, originales, traducción, adjuntos | R, dos comunicaciones / A |
| Relaciones | `/contact-restrictions` | Restricciones | relationships.restriction.read | Todos | PageHeader, filtros, DataList | R / A |
| Relaciones | `/contact-restrictions/new` | Registrar restricción | relationships.restriction.create | Todos | TargetPicker, confirmación, contexto | R sin escritura / A |
| Relaciones | `/contact-restrictions/:id` | Detalle de restricción | relationships.restriction.read; lift adicional | Todos; levantamiento A/D | Detalle, contexto, acciones | R / A |
| Planificación | `/opportunities` | Oportunidades | opportunities.read | Todos | PageHeader, filtros, DataList | R / A |
| Planificación | `/opportunities/new` | Crear oportunidad, con origen opcional | opportunities.create | Todos | FormSection, origen, TargetPicker | R / A |
| Planificación | `/opportunities/:id` | Detalle, edición y estados | opportunities.read; acciones por capability | Todos, contexto | Surface, formularios, historia, Attachments | R / A |
| Planificación | `/meetings` | Reuniones | meetings.read | Todos | PageHeader, filtros, DataList | R / A |
| Planificación | `/meetings/new` | Crear reunión, con contexto opcional | meetings.create | Todos | FormField, contexto, fecha/zona | R / A |
| Planificación | `/meetings/:id` | Detalle, planificación, participantes y acuerdos | meetings.read; update/participants/results | Todos, contexto | Surface, formularios, historia | R; edición sin guardar / A |
| Herramientas | `/admin/imports` | Selección, mapeo, lotes y resultados | data_exchange.import.execute | A | Surface, FormField, DataList, Metadata | R; O inspect, solo lectura lotes / A |
| Herramientas | `/admin/exports` | Conjunto, filtros, resumen y descarga | Lectura del dominio elegido | Todos en configuración actual | Surface, FormField, acciones | R; O preview y descarga / A |
| Administración | `/users` | Cuentas y acciones inline | users.read; capabilities administrativas | A; D lectura | PageHeader, creación, UserCard, buzones | R; sin emitir credenciales / A |
| Administración | `/settings/reminders` | Recordatorios | settings.reminders.update | A | PageHeader, FormSection | R sin guardar / M |
| Administración | `/settings/verification` | Verificación | settings.verification.update | A | PageHeader, FormSection | R sin guardar / M |
| Transversal | `/notifications` | Bandeja propia | notifications.read; mark_read por apertura | Todos | PageHeader, DataList, LoadMore | R; leída/no leída / A |

Se revisaron las 38 definiciones: 34 patrones autenticados y 4 públicos/fallback. El detalle de comunicación se abrió en dos registros distintos; por eso la matriz responsive tiene 35 vistas autenticadas y 39 instancias totales. Edición, buzones, mapeo, confirmaciones, traducción, referencias y adjuntos son estados/componentes internos, no rutas nuevas.

## 5. Matriz de recorridos reales

| Recorrido | Rol | Resultado | Evidencia | Observaciones |
|---|---|---|---|---|
| Organización → persona → proceso | A | OK, enlaces pulsados | fichas, recorrido local | Relaciones demo existentes |
| Intención convertida → proceso | A | OK | detalle-intencion, detalle-proceso | No se convirtió otra intención |
| Proceso → comunicación recibida → proceso | A | OK, retorno contextual | comunicacion-recibida | Original separado de correcciones |
| Proceso → oportunidad → reunión → proceso | A | OK, enlaces pulsados | detalles oportunidad/reunión | Sin crear registros |
| Notificación ya leída → oportunidad → Atrás | A | OK | notificaciones, recorrido local | Sin cambiar lectura; el filtro retorna a su estado inicial existente |
| Usuarios → cuentas y acciones según permiso | A/D | OK | users, matriz roles | D no muestra creación, rol, desactivación o emisión; A abre buzones existentes sin guardar |
| Exportación → conjunto → resumen → descarga | A | OK, O real | excel-resumen | Libro abierto con ExcelJS; cinco organizaciones |
| Búsqueda por nombre + país | A | OK | busqueda-combinada | 2 organizaciones y 1 proceso; filtros solo reducen organizaciones |
| Correo exacto → antecedentes y contexto | A | OK | busqueda-correo-exacto | 2 comunicaciones; distingue medio registrado e historia |
| Formularios de comunicación con buzón asignado | B | OK, presentación | registrar-enviada-research-mobile | A no tiene buzón asignado: bloqueo esperado, no falla de permiso |
| Menú móvil → Organizaciones | A | OK | menu-mobile | Se cierra y mantiene aria-current |

Los enlaces internos de los recorridos se pulsaron y sus destinos se confirmaron. Los enlaces externos demo bajo example.test son placeholders; no se certificó su disponibilidad externa.

Los filtros con URL mantienen la semántica existente. No se convierte un retorno que ya limpiaba filtros en persistencia nueva. Los datos demo no llenan más de una página de listados: cambio de página/cursor con múltiples lotes se prueba mediante T, sin fabricar datos.

## 6. Matriz por rol y capabilities

Configuración consultada en role-permissions y gates del frontend; navegación y acciones contrastadas con sesiones reales. No se modificaron permisos. Se revisaron 14 vistas por A/D y 13 por B/P (54 visitas adicionales), además del registro enviado por B.

| Área/acción | A | D | B | P | Evidencia |
|---|---|---|---|---|---|
| Directorio y relaciones | Sí | Sí | Sí | Sí | N, menús y pantallas |
| Oportunidades/reuniones | Sí | Sí | Sí | Sí | N; reglas contextuales permanecen |
| Notificaciones propias | Sí | Sí | Sí | Sí | N, contador 1/2/2/0 |
| Exportar dominios legibles | Sí | Sí | Sí | Sí | N, opciones existentes |
| Usuarios | Administración | Lectura | Menú ausente | Menú ausente | N; T gates ausentes |
| Importación | Sí | Menú ausente | Menú ausente | Menú ausente | N; T capability ausente |
| Configuraciones | Sí | Menú ausente | Menú ausente | Menú ausente | N; T gates |
| Estado de organización | Sí | Acción ausente | Acción ausente | Acción ausente | N en ficha |
| Levantar restricción | Capability | Capability | Sin capability | Sin capability | C y botones de detalle N; no se levantó |
| Cierre/conversión/otras acciones | Según respuesta/contexto | Según respuesta/contexto | Según participación/autor | Según participación/autor | C/T y visibilidad N, sin escritura |
| Registrar enviada | Sin buzón en cuenta demo A | Según buzón | Buzón demo disponible | Según buzón | N; T estados de bloqueo |

La ausencia de acciones administrativas se comprobó realmente. Los escenarios con conjuntos arbitrarios de capabilities y respuestas 403 se cubren con T; no se alteraron usuarios para capturarlos.

## 7. Matriz responsive

| Cobertura | 1440×900 | 768×1024 | 390×844 | Resultado |
|---|---|---|---|---|
| 35 vistas autenticadas, incluidos detalles y formularios | 35 | 35 | 35 | 105 verificaciones: sin overflow documental, un h1 y controles etiquetados |
| Login, primer acceso, restablecimiento y fallback | 4 | 4 | 4 | 12 verificaciones equivalentes |
| Selector CLOSED corregido | Sí | Sí | Sí | Etiqueta Cerradas correcta; cambia y retorna sin escritura |
| Edición de organización/reunión | Muestreo de detalle | Detalle | Formularios abiertos | Datos iniciales y controles accesibles; sin guardar |
| Confirmación de organización | Abierta y cancelada | Sin cambio de layout general | Cancelación por Enter | Retorno de foco corregido |
| Timeline desplazado | Scroll real de 2700 px | Vista inicial | Vista inicial y texto largo | Sidebar desktop mantiene top 0; topbar sigue el documento por diseño |
| Menú móvil | Sidebar | Menú adaptable | Apertura y navegación | Sin overlay residual |

Las comprobaciones DOM revisan el documento completo, mientras las capturas representan el viewport inicial o un área desplazada. No se inspeccionaron todas las combinaciones posibles de estados internos.

Una captura full-page de Oportunidades mostró texto artificialmente estrecho. Se contrastó con viewport real: innerWidth 390, ancho del documento/main/topbar 375 (scrollbar), scrollY 0 y layout correcto. Se sustituyeron las capturas móviles por capturas de viewport. No se trató el artefacto como defecto de la aplicación.

Zoom de navegador no certificado: el proveedor de navegador utilizado no ofrece un control documentado de zoom. El reflow se verificó a 390 px. No se alteró CSS para simular zoom.

## 8. Accesibilidad

- Un h1 en las 39 instancias abiertas; jerarquía de regiones, encabezados, listas y metadatos comprobada en muestra visual y DOM.
- Controles con label nativo, aria-label o aria-labelledby en las vistas examinadas; no se detectaron controles sin identificación en la matriz.
- Errores locales de login vinculados por aria-describedby; validaciones sensibles, pending y errores del servidor cubiertos con T.
- Notificaciones muestran Leída/No leída en cada fila y en el árbol accesible. No se reimplementó esta garantía.
- Skip link oculto sin foco, visible al recorrer desde Brand con Shift+Tab; Enter enfoca `contenido`.
- Menú móvil nativo details/summary, aria-current y cierre por navegación verificados.
- Cancelar confirmación de organización con Enter devolvía foco a BODY. Corrección local devuelve foco al disparador; reauditoría real y T pasan.
- No hay axe/pa11y incorporado al proyecto. No se instaló una herramienta nueva; se utilizaron Testing Library, DOM, teclado y revisión visual.
- Contraste inicial calculado por luminancia sRGB: texto principal #1E293B sobre #F6F8FB = 13.75:1; azul #203150 sobre blanco = 12.99:1; secundario anterior #64748B sobre blanco = 4.76:1. Sobre #F6F8FB daba 4.47:1, inferior a 4.5:1 para texto normal. Confirmación DOM inicial: descripción de Organizaciones, 14 px/400, colores rgb(100,116,139) y rgb(246,248,251).

### Comprobación final F03

La instrucción final autoriza ajustar exclusivamente el contraste secundario. Se volvió a medir la descripción de Organizaciones: 14 px, opacidad 1, `rgb(100, 116, 139)` sobre el fondo efectivo `rgb(246, 248, 251)`, 4.4729799:1. La causa es `--color-app-muted`, consumido por PageHeader/descripciones, ayudas, metadatos, resúmenes y texto auxiliar del shell.

Se cambia únicamente ese token de `#64748B` a `#5D6D83`. No se modifican azul, verde, fondos, colores semánticos, componentes ni funcionalidades. El oscurecimiento también proporciona margen sobre la superficie de apoyo, que antes daba 4.20:1.

| Superficie | Color efectivo de fondo | Antes | Después |
|---|---|---|---|
| Institucional | #F6F8FB | 4.47:1 | 4.96:1 |
| Blanca | #FFFFFF | 4.76:1 | 5.28:1 |
| Apoyo | #EDF1F6 | 4.20:1 | 4.65:1 |

Fórmula sRGB aplicada sin redondear antes de comparar. Después, getComputedStyle confirma `rgb(93, 109, 131)` con opacidad 1 en la descripción, ayudas y metadatos sobre fondos institucional/blanco. El valor efectivo de `--color-brand-soft` sigue siendo #EDF1F6; el cálculo incluye esta combinación utilizada por controles deshabilitados y contexto institucional. No se presenta esa combinación como una captura de un control deshabilitado.

Revisión adicional autenticada: Organizaciones a 1440×900, Crear reunión a 768×1024 y Notificaciones/ficha de organización a 390×844. Sin overflow documental. Listados, ayudas, botones, inputs, selects, badges y estados leído/no leído conservan su presentación y semántica. Los controles activos mantienen texto #1E293B sobre blanco; botones y badges mantienen sus colores específicos. El borde hover de controles comparte el token y se oscurece ligeramente; no cambian dimensiones ni interacción.

Tres regresiones leen los colores del CSS fuente y exigen al menos 4.6:1 sobre las tres superficies, sin fijar un hexadecimal concreto. Antes fallaban institucional/apoyo; después pasan las tres. La comprobación DOM complementa estos tests, que por sí solos no prueban la cascada renderizada.

**F03 corregido satisfactoriamente. No se declara conformidad WCAG 2.2 AA completa ni se realizó una nueva auditoría exhaustiva.**

## 9. Formularios, estados y fechas

Se revisaron formularios iniciales de todos los módulos, controles administrativos, edición de organización y planificación de reunión, confirmación de desactivación con cancelación, restricciones y registro de comunicaciones con su contexto. Se abrió Gestión de buzones del usuario Búsqueda: buzón asignado existente y formulario de registro; controles etiquetados y sin overflow también en móvil. No se añadió ni retiró ningún buzón. No se enviaron formularios de negocio. La cuenta Administrador demo no tiene buzón habilitado; la interfaz lo informa y bloquea el registro enviado. Búsqueda sí tiene el buzón asignado y se comprobó el formulario.

Cargas, errores, retry, vacíos, permisos, conflictos de versión, sesión expirada, doble submit, confirmaciones y éxito después de respuesta se verifican mediante suites actuales. En navegador se comprobaron cargas normales, resultados existentes/vacíos y validación local de login. No se desconectó infraestructura ni se alteró backend para simular errores.

Oportunidades conserva fecha civil: 05/11/2026 en el registro demo, representada mediante deadlineLabel sin conversión de zona. Reunión: 20/10/2026 10:30 America/La_Paz, distinta de la fecha de registro. Comunicaciones: fecha real enviada/recibida y registro separados. Timeline conserva hechos, registro y fechas programadas. Helpers, contratos y pruebas temporales inspeccionados; no se modificaron serialización ni cálculos.

Las operaciones sensibles se verificaron con fixtures/mocks: cierre/reapertura, invalidación, restricciones, desactivación, credenciales, consolidación, registro de comunicaciones, importación y otras mutaciones. No se efectuó una escritura para producir capturas.

## 10. Excel y autenticación

Inspección real del XLSX sintético preexistente de QA: 2 filas, 3 columnas. Se asignan nombre y país. No se pulsó Analizar y crear preview ni se confirmó importación. Consultado lote analizado existente con decisión pendiente: confirmación deshabilitada. Consultado lote importado existente: 2 analizadas, 1 importada, 1 inválida; resultado parcial correcto.

Exportación real de Organizaciones activas: resumen 5 registros y descarga XLSX abierta con ExcelJS. Hojas: Organizaciones 6 filas incluida cabecera, Categorías 2, Medios de contacto 3. Descarga almacenada localmente fuera de Git.

Login/logout reales con las cuentas demo autorizadas; sesión de Administrador restaurada. Primer acceso y restablecimiento revisados sin secretos. Consumo, expiración, token inválido/utilizado, 401, conflicto y resultados se cubren con T, no se presentan como consumos reales. Recuperación pública independiente no existe: la emisión permanece en Usuarios por Administrador.

Notificaciones y contador coherentes por usuario; se abrió una notificación ya leída y se regresó mediante Atrás. No se marcaron avisos nuevos como leídos para QA; PATCH, invalidación y cursor comprobados con T.

## 11. Hallazgos clasificados

| ID | Módulo | Hallazgo | Severidad | Reproducción | Impacto | Acción | Estado |
|---|---|---|---|---|---|---|---|
| F01 | Intenciones | URL CLOSED muestra Todas; falta Cerradas | P2, preexistente UI 2.6 | Abrir ?state=CLOSED; consulta usa CLOSED pero option ausente | Filtro inaccesible desde selector y etiqueta engañosa | Añadir option de estado ya admitido | Corregido y reauditado |
| F02 | Organización | Cancelar confirmación pierde foco | P2, localizado | Abrir Desactivar y activar Volver sin cambiar estado con Enter | Se pierde referencia de interacción por teclado | Ref al disparador; focus al cancelar | Corregido y reauditado |
| F03 | Foundations | Secundario sobre fondo daba 4.47:1 | P2, preexistente | Colores efectivos + fórmula sRGB | Contraste insuficiente para texto normal | Ajustar únicamente app-muted a #5D6D83; mínimo auditado 4.65:1 | Corregido; DOM, tres regresiones y capturas |
| F04 | Formularios/contexto | Restos de Field/inputClass/buttonClass legacy | P3, preexistente | Código directory-ui y formularios iniciales/detalle de medio/contexto | Bordes/densidad diferentes; controles operables, etiquetados y sin overflow | Documentar; no migración masiva por uniformidad | No bloqueante |
| F05 | Contexto/historia | Concordancia singular residual | P3, preexistente | 1 categorías seleccionadas; 1 procesos activos; 1 participantes | Texto menor, cantidades comprensibles | Ajuste editorial independiente sin consultas/reglas | No bloqueante |
| F06 | Build | Chunk principal superior a 500 kB | P3 / deuda técnica | yarn build | Posible costo de carga; sin bloqueo observado | Plan de code splitting independiente | Pendiente no bloqueante |

P0/P1: ninguno conocido en la cobertura ejecutada. No se afirma ausencia de vulnerabilidades fuera de esta auditoría. Los tres P2 F01/F02/F03 están resueltos; permanecen F04/F05/F06 como observaciones P3. Resolver F03 no constituye una certificación AA del sistema.

## 12. Correcciones realizadas y regresiones

| Archivo | Causa y cambio | Riesgo | Validación |
|---|---|---|---|
| contact-intents-page.tsx | Falta option CLOSED; se añade Cerradas, sin cambiar parser, handler ni query | Bajo, presentación de filtro existente | Dos tests rojos antes; verdes después; N en tres tamaños |
| contact-intents.test.tsx | Proteger valor por URL y selección/retorno sin escrituras | Bajo | 49 tests de la suite pasan |
| organization-detail-page.tsx | Foco perdido al retirar panel; useRef en botón de estado y focus al cancelar | Bajo; no cambia operación ni estado | Enter en navegador: foco en Desactivar organización y ficha Activa |
| directory-detail.test.tsx | Proteger foco, conservación de estado y ausencia de petición de escritura | Bajo | Test rojo antes, verde después; suite 17 pasa |
| styles.css | Solo token app-muted: #64748B → #5D6D83 | Bajo; oscurecimiento pequeño de texto auxiliar y borde hover | Colores efectivos, matriz de contraste y responsive |
| contrast.test.ts | Tres superficies con umbral 4.6:1 y colores leídos del CSS | Sin cambios de runtime | Dos casos fallan antes; tres pasan después |

No se cambia la implementación de las primitivas compartidas ni sus consumidores. Tras F01/F02 sus dos suites suman 66 pruebas aprobadas; F03 incorpora tres casos adicionales de contraste.

## 13. Evidencias

Artefactos locales ignorados en `storage/qa-ui-2.12/`; no se incorporan a Git. Registros DOM `vistas.json`, `roles.json` y `recorridos.json` contienen datos demo y resultados de navegación, sin credenciales. Las capturas son del producto real, no mockups ni fixtures renderizados como evidencia real.

| Grupo | Capturas representativas nuevas |
|---|---|
| Inicio/roles | dashboard-administrator.jpg, dashboard-board.jpg, dashboard-research.jpg, dashboard-planning.jpg |
| Directorio | organizations-desktop.jpg, ficha-organizacion-desktop.jpg, ficha-persona-tablet.jpg, medio-contacto-mobile.jpg |
| Búsqueda | busqueda-combinada-desktop.jpg, busqueda-correo-exacto-desktop.jpg |
| Relaciones | detalle-intencion-desktop.jpg, detalle-proceso-mobile.jpg, timeline-desplazado-desktop.jpg, detalle-restriccion-mobile.jpg |
| Comunicaciones | comunicacion-enviada-desktop.jpg, comunicacion-recibida-mobile.jpg, registrar-enviada-research-mobile.jpg |
| Planificación | opportunities-mobile.jpg, detalle-oportunidad-desktop.jpg, detalle-reunion-tablet.jpg, meetings-new-mobile.jpg |
| Administración | users-desktop.jpg, buzones-desktop.jpg, buzones-mobile.jpg, settings-reminders-mobile.jpg, settings-verification-tablet.jpg |
| Herramientas | admin-imports-mobile.jpg, excel-mapeo-desktop.jpg, excel-lote-resultado-desktop.jpg, excel-resumen-desktop.jpg |
| Transversales | notifications-mobile.jpg, login-desktop.jpg, primer-acceso-mobile.jpg, restablecimiento-tablet.jpg, menu-mobile.jpg, skip-link-foco.jpg |
| Regresiones | intenciones-closed-antes.jpg, intenciones-closed-despues-desktop.jpg, intenciones-closed-despues-tablet.jpg, intenciones-closed-despues-mobile.jpg, foco-cancelacion-despues-mobile.jpg |
| F03 | f03-organizations-desktop.png, f03-meeting-tablet.png, f03-notifications-mobile.png |

Se conservan evidencias previas de UI 2.10/2.11 para formularios completos y estados locales. Los escenarios extremos y las escrituras siguen siendo T, no operaciones reales ni capturas simuladas.

## 14. Pruebas y validaciones

| Grupo | Baseline | Nuevas | Final |
|---|---|---|---|
| Frontend | 857 / 44 archivos | 6 | 863 / 45 archivos |
| API | 926 / 55 suites | 0 | 926 / 55 suites |
| Total | 1783 | 6 | 1789 |

Todas aprobadas. F01/F02 añadieron tres regresiones que fallaban antes de sus correcciones. F03 añade tres casos; dos fallaban con la paleta anterior. No quedan fallos finales ni pruebas borradas u omitidas. El primer typecheck de F03 detectó tipos Node y acceso a canales potencialmente undefined en el test; se corrigió el propio test y se repitieron typecheck/build satisfactoriamente.

Ejecutados y aprobados después de F01/F02; los cuatro comandos raíz y git diff --check se ejecutaron nuevamente tras F03:

- yarn lint
- yarn typecheck
- yarn test
- yarn build
- yarn workspace @cecasem-conecta/web lint
- yarn workspace @cecasem-conecta/web typecheck
- yarn workspace @cecasem-conecta/web test
- yarn workspace @cecasem-conecta/web build
- git diff --check

No se ejecutó el script separado de integración PostgreSQL, migraciones, Docker build o certificación de despliegue: no hay cambios de persistencia/infraestructura y esta tarea audita frontend. Las cifras API corresponden al script habitual yarn test, no a una prueba integral de producción.

Bundle final: 773.52 kB, gzip 209.50 kB; baseline aproximado 773.41 kB. Aumento 0.11 kB; build satisfactorio, sin regresión perceptible de navegación observada. No se realizó una medición de rendimiento de red/dispositivo productivo. Se recomienda optimización independiente basada en perfiles.

## 15. Estado Git y recomendación

HEAD y rama permanecen los del baseline. Cinco archivos versionados modificados (dos componentes, dos tests y styles.css); nuevos contrast.test.ts y `docs/ui-2.12-auditoria-final-frontend.md`. F01/F02 conservados. Sin backend, contratos, lockfile, capturas, descargas, datos runtime ni secretos en el diff. NO COMMIT. NO PUSH.

Se recomienda cerrar el rediseño frontend **con observaciones P3**: F04 legacy residual, F05 concordancia menor y F06 bundle. F01/F02/F03 resueltos. UI 2.12 puede cerrarse visual y técnicamente en el alcance comprobado.

Trabajos independientes: auditoría WCAG exhaustiva; ajustes editoriales puntuales; optimización del bundle; pruebas funcionales integrales del sistema; validación de despliegue/infraestructura y seguridad del backend. El cierre UI no certifica estas áreas ni permite omitirlas.
