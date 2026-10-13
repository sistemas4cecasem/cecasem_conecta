# Refinamiento visual: Institucional contemporáneo

Fecha: 12 de octubre de 2026.

## 1. Cambios implementados

Se aplicó la dirección aprobada sobre el frontend existente: títulos con mayor jerarquía, superficies blancas sobrias, registros compactos, metadatos agrupados y controles uniformes. Se conservaron el logotipo, el sidebar y los colores institucionales. La topbar móvil distribuye mejor el logotipo, menú, notificaciones y cuenta.

Organizaciones y Personas admiten dos columnas para registros breves en escritorio amplio; los registros complejos permanecen en una columna. Usuarios conserva su tabla administrativa y la cronología de Procesos conserva su estructura especializada.

## 2. Patrones reutilizados y consolidados

| Patrón | Regla aplicada |
| --- | --- |
| `PageHeader` | Retorno contextual en un único espacio antes del título; listado principal sin retorno innecesario. Se conservan los destinos existentes y el contexto de personas dentro de una organización. |
| `ActionLink` | Variantes para ficha, referencia, contexto, retorno y acción; indicación visual mediante iconos y tipografía, con subrayado en texto cuando resulta útil. |
| `ExternalLink` | Enlace nativo con indicación de apertura externa; conserva URL, destino y atributos de seguridad. |
| `DataList` | Registros y filas compactas; dos columnas únicamente donde el contenido y el ancho lo permiten. |
| `Metadata` | Distribución lineal o agrupada; campos extensos definidos explícitamente, sin depender de su posición. |
| `FormField` | Etiqueta, ayuda y error asociados al control. Compatibilidad con campos existentes, conservando referencias y handlers de React Hook Form. |
| `FormSection`, `FormActions` | Agrupaciones semánticas y acciones coherentes; columnas para campos breves y una columna en móvil. |
| `Pagination`, `FilterBar` | Presentación y contadores uniformes; limpieza de los filtros ya soportados. |
| `directory-ui.tsx` | `Field` y `Pagination` delegan en componentes comunes; carga y errores reutilizan `QueryFeedback` y `Alert`. |

Se reutilizan también `Button`, `Surface`, `StatusBadge`, `EmptyState`, `ConfirmationPanel` y el catálogo de iconos. No se agregó una biblioteca paralela ni dependencias.

## 3. Pantallas afectadas

- Dashboard y listas de actividad.
- Organizaciones: listado, creación, resumen, personas vinculadas, contactos, sedes y control institucional.
- Personas externas: listado, creación, edición y ficha, incluyendo navegación anidada.
- Intenciones, Procesos y Restricciones: listados, formularios y detalles.
- Comunicaciones: listados, registro de envío/recepción y detalle.
- Oportunidades y Reuniones: listados, formularios, selección de origen y detalles.
- Usuarios: tabla, creación y ficha administrativa.
- Búsqueda, notificaciones y referencias relacionadas.
- Configuración, categorías e importación/exportación reciben los estilos comunes sin cambiar sus flujos.

## 4. Inconsistencias resueltas

- Posiciones dispares de los retornos y duplicación entre encabezado y pie de formulario.
- Enlaces de navegación con subrayados permanentes y estilos locales distintos.
- Separadores planos frente a registros sin una agrupación visual reconocible.
- Campos y paginaciones implementados en paralelo en Directorio.
- Metadatos de organización encerrados en numerosos bloques pequeños y dependientes de selectores posicionales.
- Selección de procesos y oportunidades en Crear reunión con botones extensos sin estado visual uniforme. Ahora muestra filas compactas, selección explícita y resumen del origen, manteniendo las consultas y callbacks existentes.
- Acciones de confirmación sensibles con presentación equivalente a acciones ordinarias.
- Exceso de altura de la topbar móvil.

## 5. Validación

| Verificación ejecutada | Resultado |
| --- | --- |
| `yarn workspace @cecasem-conecta/web lint` | Correcto. |
| `yarn workspace @cecasem-conecta/web typecheck` | Correcto; también se ejecuta dentro del build. |
| `yarn workspace @cecasem-conecta/web build` | Correcto. Advertencia de Vite: bundle principal de 812,71 kB, superior a 500 kB. |
| `yarn workspace @cecasem-conecta/web test --exclude '**/features/auth/*.test.tsx'` | 41 archivos y 794 pruebas correctas. Excluye los tres archivos de autenticación con fallos del baseline. |
| `yarn workspace @cecasem-conecta/web test` | 812 correctas y 39 fallidas; 41 archivos correctos y 3 fallidos. |
| Suite completa antes de modificar | 808 correctas y los mismos 39 fallos; 847 pruebas. |
| `git diff --check` | Correcto. |

Los 39 fallos anteriores pertenecen a `auth.test.tsx` (2), `first-access.test.tsx` (18) y `reset-password.test.tsx` (19). Las expectativas de recuperación pública de esas pruebas no coinciden con las rutas existentes. No se modificaron autenticación ni el router para este refinamiento.

Se añadieron cuatro pruebas: asociación de campos heredados, retorno contextual único, descripción accesible del enlace externo y selección de proceso por teclado en Crear reunión. No se eliminaron pruebas ni expectativas existentes.

### Revisión visual autenticada

Se revisó la aplicación local con la sesión demo Administrador disponible en el entorno. Resoluciones CSS comprobadas: 1440 × 900, 768 × 1023 y 390 × 843; también 1100 × 900 para pantallas representativas.

Se recorrieron 21 pantallas principales, siete fichas y rutas adicionales de pestañas de organización, persona anidada, comunicaciones y categorías. Se comprobó el ancho del documento; no se detectó desbordamiento horizontal en esas vistas. Las 21 pantallas principales se revisaron nuevamente en móvil después del ajuste final de la topbar.

Se ejercitaron la búsqueda y limpieza en Organizaciones, el despliegue de filtros, el retorno de persona a su organización, la selección por teclado y retirada del origen de reunión, la actualización de la cronología y los retornos de ficha/creación de Usuarios. Las acciones de escritura se cubrieron mediante pruebas frontend con respuestas simuladas; no se guardaron cambios de negocio durante la inspección visual.

## 6. Limitaciones y pendientes reales

- La suite completa sigue fallando por los 39 problemas de autenticación presentes antes del trabajo. El frontend modificado pasa las pruebas focalizadas; no se declara una suite completa verde.
- Vite advierte sobre el tamaño del bundle principal. El build termina correctamente; su división requeriría un trabajo de rendimiento separado.
- La inspección visual autenticada corresponde al rol Administrador demo; no equivale a una revisión manual completa de todos los roles, navegadores o una certificación de accesibilidad.
- No se ejecutaron validaciones de infraestructura, migraciones o backend, porque el alcance implementado es frontend.

## 7. Git y alcance del diff

El árbol estaba limpio al iniciar. Resultado: 57 archivos existentes modificados y este informe nuevo; sin commits ni push. Los cambios de aplicación están limitados a `apps/web/src`. No se modificaron backend, contratos de API, migraciones, permisos, dependencias ni lockfile. La revisión de llamadas existentes a API y mutaciones no encontró cambios en sus argumentos. No se incorporaron secretos, archivos de entorno, capturas, uploads ni datos de ejecución al diff.

### Lista completa de archivos

- `apps/web/src/components/ui/actions.tsx`
- `apps/web/src/components/ui/forms.tsx`
- `apps/web/src/components/ui/layout.tsx`
- `apps/web/src/components/ui/lists.tsx`
- `apps/web/src/components/ui/primitives.css`
- `apps/web/src/components/ui/primitives.test.tsx`
- `apps/web/src/features/communications/communication-detail-page.tsx`
- `apps/web/src/features/communications/communications-list.tsx`
- `apps/web/src/features/communications/received-communication-page.tsx`
- `apps/web/src/features/communications/sent-communication-page.tsx`
- `apps/web/src/features/directory/consolidation-provenance.tsx`
- `apps/web/src/features/directory/contact-associations.tsx`
- `apps/web/src/features/directory/contact-create-form.tsx`
- `apps/web/src/features/directory/contact-detail-page.tsx`
- `apps/web/src/features/directory/directory-detail.css`
- `apps/web/src/features/directory/directory-pages.css`
- `apps/web/src/features/directory/directory-ui.tsx`
- `apps/web/src/features/directory/duplicate-panel.tsx`
- `apps/web/src/features/directory/organization-detail-page.tsx`
- `apps/web/src/features/directory/organization-form.tsx`
- `apps/web/src/features/directory/organization-locations-page.tsx`
- `apps/web/src/features/directory/organization-person-form.tsx`
- `apps/web/src/features/directory/organization-presentation.css`
- `apps/web/src/features/directory/organization-summary.tsx`
- `apps/web/src/features/directory/organizations-page.tsx`
- `apps/web/src/features/directory/organizations.css`
- `apps/web/src/features/directory/people-page.tsx`
- `apps/web/src/features/directory/person-detail-page.tsx`
- `apps/web/src/features/directory/person-form.tsx`
- `apps/web/src/features/directory/person-relations.tsx`
- `apps/web/src/features/directory/search-page.tsx`
- `apps/web/src/features/directory/target-picker.tsx`
- `apps/web/src/features/home/dashboard-views.tsx`
- `apps/web/src/features/home/dashboard.css`
- `apps/web/src/features/meetings/meeting-components.tsx`
- `apps/web/src/features/meetings/meetings-pages.test.tsx`
- `apps/web/src/features/meetings/meetings-pages.tsx`
- `apps/web/src/features/meetings/meetings.css`
- `apps/web/src/features/notifications/notifications-page.tsx`
- `apps/web/src/features/opportunities/opportunities-pages.tsx`
- `apps/web/src/features/referrals/referrals-panel.tsx`
- `apps/web/src/features/relationships/contact-intent-create-page.tsx`
- `apps/web/src/features/relationships/contact-intent-detail-page.tsx`
- `apps/web/src/features/relationships/contact-intents-page.tsx`
- `apps/web/src/features/relationships/contact-restriction-create-page.tsx`
- `apps/web/src/features/relationships/contact-restriction-detail-page.tsx`
- `apps/web/src/features/relationships/contact-restriction-notice.tsx`
- `apps/web/src/features/relationships/contact-restrictions-page.tsx`
- `apps/web/src/features/relationships/relationship-context-panel.tsx`
- `apps/web/src/features/relationships/relationship-process-create-page.tsx`
- `apps/web/src/features/relationships/relationship-process-detail-page.tsx`
- `apps/web/src/features/relationships/relationship-processes-page.tsx`
- `apps/web/src/features/relationships/relationships-pages.css`
- `apps/web/src/features/users/user-card.tsx`
- `apps/web/src/features/users/users-page.tsx`
- `apps/web/src/features/users/users.css`
- `apps/web/src/styles.css`
- `docs/refinamiento-visual-institucional-contemporaneo.md` (nuevo)
