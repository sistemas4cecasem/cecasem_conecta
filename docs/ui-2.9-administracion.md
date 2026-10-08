# UI 2.9 — Administración: usuarios y configuración

## Baseline

Rama main, HEAD 3a7be8a317626e4d63fc1c3940ee1266c88f0072.
UI 2.8 incorporada y árbol inicial limpio. Baseline ejecutado: 785 pruebas web.

## Alcance y presentación

Se rediseñan las rutas existentes /users, /settings/reminders y
/settings/verification, sin nuevas rutas ni paneles administrativos.
Usuarios separa cabecera, creación compacta, consulta y listado operativo.
Cada fila conserva identidad, username, correo, rol actual, estado y acceso.
Las operaciones de acceso y las de estado se agrupan por usuario.
Desactivación tiene tono de peligro y la confirmación original; reactivación
sigue disponible conforme a la implementación previa. Seleccionar rol no guarda.

La creación conserva Nombres, Apellidos, Correo electrónico y Rol, con default
Búsqueda; normalización, esquema Zod, payload, reset e invalidación intactos.
FormField asocia labels, ayudas y errores. Los campos obligatorios se indican
sin añadir restricciones nativas a la validación existente.

El acceso solo expone PENDING_FIRST_ACCESS y ESTABLISHED en el contrato actual.
No se inventa una condición de restablecimiento pendiente. La credencial temporal
mantiene emisión, enlace, fecha de caducidad, copia y cierre existentes, estado
local efímero, abort al desmontar y exclusión de caché y almacenamiento persistente.
No se cambia TTL ni el mecanismo de primer acceso/restablecimiento.

Buzones conserva catálogo, asignación y retirada, registro y proveedor opcional.
Se muestran nombre, dirección, proveedor y estado real. El buzón no representa
una cuenta de autenticación ni una integración con el proveedor de correo.

Recordatorios muestra el intervalo real en días, con límites existentes 1–36500,
versión esperada, guardado explícito y aplicación al próximo barrido. Se conserva
la explicación de intenciones/procesos y la inmutabilidad de estados e historial.
Verificación mantiene dos intervalos separados en meses calendario, límites
1–120, versión, guardado y recarga por conflicto existentes. La explicación
aclara que modificar información no equivale a verificar y preserva evidencias.

No se modifican backend, API, Prisma, contratos, autenticación, RBAC,
capabilities, hooks, consultas, comandos ni reglas de negocio. Se mantienen
las claves de queries y los handlers originales. No se agregan dependencias
ni se ajustan primitivas compartidas o pantallas de subfases anteriores.

## QA visual autenticada

Administrador: Usuarios, tres filtros, creación sin enviar, acciones, confirmación
abierta y cancelada, buzones sin modificar y ambos formularios de configuración.
Se comprobaron Usuarios, buzones, recordatorios y verificación en 1440×900,
768×1024 y 390×844: 12 combinaciones sin desbordamiento horizontal y un h1.
También se revisaron labels, ayudas y foco visible al recorrer los controles.
Los datos vigentes mostraron 7 días, 6 meses personales y 12 institucionales.
Esos valores se obtienen del servidor; no están fijados como valores visuales.

Directorio: listado activo en navegador, sin filtros, creación, botones ni
agrupaciones administrativas vacías. Búsqueda y Planificación: sesión real en
Inicio sin enlaces administrativos. No se intentaron rutas restringidas por URL.
Las negativas de autorización están cubiertas mediante tests autorizados.
No se crearon cuentas, emitieron credenciales, cambiaron roles/estado, modificaron
buzones ni guardaron configuraciones reales. Sesión Administrador restaurada,
viewport normal y tabs temporales cerrados. Capturas ignoradas en storage/qa-ui-2.9.

## Validaciones

30 pruebas adicionales: 13 usuarios, 5 recordatorios y 12 verificación.
Frontend 815 pruebas / 44 archivos; API 926 pruebas / 55 suites; total 1741.
Lint, typecheck, tests y build aprobados tanto en web como en el monorepo.
Diff revisado y git diff --check aprobado; sin secretos ni artefactos QA versionados.
Persiste la advertencia existente del bundle principal mayor a 500 kB
(774.63 kB); su optimización queda fuera del alcance.

UI 2.9 puede cerrarse con esta observación. Validación realizada antes del commit;
sin push.
