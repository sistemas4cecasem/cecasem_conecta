# Perfil de personas dentro de una organización

Decisión funcional del 15 de octubre de 2026.

- La ficha contextual presenta un solo encabezado y una vuelta al listado de personas de la organización; no repite el encabezado del espacio de organización ni las rutas visuales «Directorio / …».
- Los medios de contacto omiten el enlace a la persona que ya está abierta y muestran su última actualización.
- El perfil muestra cargo y función junto a los datos personales. No presenta un bloque separado de mantenimiento de vínculos institucionales.
- Los paneles de posibles duplicados se retiran de las fichas de personas y del control de organizaciones. Se conservan los registros y referencias de consolidaciones anteriores.
- Solo Administrador recibe `directory.history.read`. La API protege todos los endpoints de historial del directorio con ese permiso. La UI también impide consultas y visualización para otros roles, incluso ante una capability antigua en caché.
- La fecha de última actualización permanece visible para los usuarios autorizados a leer la ficha.
- `relationship-context?personId=…&view=person-profile` conserva el contexto directo de la persona, omite el contexto de sus organizaciones y añade procesos distintos con coincidencias exactas de los correos asociados en remitentes o destinatarios registrados. Incluye comunicaciones invalidadas y correos anteriormente asociados para preservar el rastro histórico; no atribuye toda la actividad de una organización a sus empleados.
- La lista de procesos por correo está acotada a cinco, con total y enlaces a la búsqueda de cada dirección para consultar todos los antecedentes. Los cuerpos y datos de comunicaciones ajenas no se incluyen en esta proyección.
- No se modifica el esquema de la base ni se requiere una migración adicional.

## Validación

- `yarn lint`, `yarn typecheck` y `yarn build`: correctos.
- 287 pruebas de integración PostgreSQL/HTTP correctas: directorio, personas, contactos, historial y contexto institucional. Incluyen rechazo a roles no administradores y coincidencias de procesos por correo sin duplicar procesos ni incluir actividad institucional ajena.
- 69 pruebas enfocadas de perfil contextual, historial y contexto correctas.
- `yarn test`: API 955 correctas; web 813 correctas. Se actualizan los escenarios del formulario y del perfil a los controles vigentes.
- `git diff --check` correcto; sin nuevos secretos ni archivos de entorno en el diff.

## Edición unificada del perfil

- En el listado de personas de una organización solo aparecen nombre enlazado, estado, cargo y función. Se retiran los detalles desplegables y sus formularios y acciones.
- El botón «Editar datos de la persona» abre un solo formulario para nombres, medios de contacto y cargo/función. No expone contexto técnico de asociaciones, fuentes ni controles de vigencia o fechas.
- Los contactos del perfil son de consulta: tipo, valor, etiqueta y última actualización. No repiten contadores o estados de asociación ni enlaces al mantenimiento técnico del medio.
- `GET /people/:id/profile` devuelve una instantánea coherente con los contactos activos y los cargos; puede delimitar los cargos por `organizationId`.
- `PUT /people/:id/profile` exige escritura y versiones de persona, asociaciones, medios y cargos. Guarda todo en una transacción y revierte todos los cambios si alguna sección falla. Un conflicto conserva el borrador hasta que el usuario recarga explícitamente.
- Corregir un valor de contacto crea un medio nuevo o reutiliza uno permitido por las reglas de asignación, y finaliza lógicamente la asociación previa. No sobrescribe el medio compartido de otra persona ni elimina antecedentes. Retirar un medio también conserva su asociación histórica.
- Las correcciones de cargo/función conservan identidad, vigencia, fechas, fuentes e historial del vínculo. No requieren cambios del esquema.

Validación de la edición unificada: lint, typecheck y build correctos; 165 pruebas de integración PostgreSQL/HTTP correctas en personas y contactos, incluidas atomicidad, conservación del correo compartido, versiones y rechazo de vínculos ajenos.

## Contactos de la organización

- El listado muestra una tarjeta por contacto, con tipo, valor, etiqueta, disponibilidad y última actualización. Omite el nombre de la organización y los contadores/estados técnicos de asociaciones.
- El enlace de cada tarjeta abre `/organizations/:id/contacts/:contactId`, conservando la organización como origen de navegación y una única vuelta a su listado de contactos.
- Esa ficha omite los bloques de personas y organizaciones asociadas en lectura habitual. Al corregir un medio compartido se muestran los usos afectados para mantener la confirmación explícita de una corrección global.
- Se sustituye «medio canónico» por «medio de contacto registrado» en el formulario/selector y por fecha de actualización en la ficha.
- El historial de medios y de sus relaciones conserva la restricción a Administrador, tanto para renderizar como para consultar la API.

Validación de contactos de organización: lint y tipos del frontend correctos; build general correcto; `yarn test` con 955 pruebas de API y 817 de interfaz correctas. Las pruebas cubren varias tarjetas, navegación contextual, ausencia de consultas de asociaciones en lectura e historial restringido por rol.

## Registro sin selección de medios existentes

- El formulario de añadir contacto solo permite introducir un medio nuevo; se retiran el selector, el catálogo y la acción de reutilización.
- Un correo ya registrado muestra un aviso y bloquea el envío, conservando fuente y observaciones. El servidor vuelve a validar el conflicto aunque no haya terminado la consulta previa.
- En el registro interactivo y la edición de perfiles, un correo con una asociación previa no se puede asignar a otra persona u organización, aunque la asociación anterior esté retirada. La comprobación se realiza bajo el bloqueo del medio para impedir asignaciones concurrentes.
- Las asociaciones históricas ya compartidas se conservan; repetir una asociación del mismo propietario no cambia sus datos. La restricción nueva se aplica al correo y no introduce unicidad global de teléfonos.

Validación del registro sin reutilización: lint, typecheck y build generales correctos; 955 pruebas de API y 816 de interfaz correctas, además de 168 pruebas de integración de personas/contactos. La primera ejecución general de interfaz agotó el tiempo de una prueba de comunicaciones; la repetición completa de interfaz pasó.

## Sedes con contactos propios

- El formulario de sede omite las áreas de interés propias y permite añadir varios medios de contacto opcionales con tipo, valor y etiqueta.
- `POST /organizations/:id/branches` crea la sede y sus contactos en una sola transacción, con permiso de escritura y validación del referente. Un correo ocupado revierte la sede y todos los contactos del intento.
- Las sedes mantienen el modelo de organización con `branchOfId`; sus áreas efectivas se obtienen de la organización principal, incluyendo cadenas de sedes. Al actualizar las áreas de la principal, las lecturas de las sedes reflejan el cambio sin copiar esos valores a cada registro.
- Las áreas propias históricas no se muestran como independientes. Una corrección de la ficha registra los cambios con el historial existente.
- El listado de sedes muestra información básica y enlaza al perfil de consulta. La edición de datos y contactos se concentra en el botón «Editar sede» dentro del perfil.
- Los contactos se consultan en el perfil de sede, con vuelta al listado de sedes de la organización principal. Los correos mantienen la restricción de propietario único del registro interactivo.
- No se añaden tablas, columnas ni migraciones.

Validación de sedes: 223 pruebas de integración PostgreSQL/HTTP de directorio, contactos y personas correctas; `yarn test` con 955 pruebas de API y 818 de interfaz correctas; typecheck general correcto.
Lint y build generales también correctos para el cambio de sedes; `git diff --check` sin errores.

## Nombre y lugar de la sede

- En las sedes, «País (opcional)» se presenta como «Lugar de la sede», obligatorio, usando el campo existente `country`. No se cambia el país opcional de las organizaciones principales.
- El nombre se completa con el de la organización referente y se muestra de solo lectura. El alta específica de sede no acepta un nombre enviado por el cliente; el servidor lo asigna. Las correcciones de sedes también toman el nombre del referente.
- El lugar se valida tanto en el formulario como en la API y las reglas del servicio: no admite ausencia, vacío ni solo espacios. Los registros antiguos incompletos se conservan y deberán indicar el lugar al corregir su ficha.

Validación de nombre/lugar de sede: lint, typecheck y build correctos; 955 pruebas de API, 819 de interfaz y 223 de integración correctas.

## Directorio principal y sedes

- El listado principal de organizaciones consulta únicamente registros con `branchOfId = null`. La restricción se aplica antes del conteo y la paginación, en las consultas ordinarias y en los filtros de país/comunicaciones.
- Los listados explícitos de sedes siguen acotados por su organización referente; se conservan las sedes y representaciones anidadas y el acceso a sus fichas/contactos.
- La página de directorio no propaga un `branchOfId` procedente de una URL antigua, ni presenta el metadato «Sede de» en las tarjetas de organizaciones principales.
- No se modifican ni eliminan registros ni vínculos existentes.

Validación del directorio principal: 83 pruebas de integración de directorio/filtros correctas; 955 pruebas de API y 820 de interfaz correctas; lint y typecheck generales correctos.
Build general correcto y `git diff --check` sin errores para el cambio de directorio principal.

## Perfil de sede y edición unificada

- El listado de sedes muestra nombre enlazado, lugar, descripción y estado. No carga contactos ni expone botones de edición o registro de medios desde cada tarjeta.
- `/organizations/:id/locations/:branchId` abre un perfil de consulta, con una vuelta al listado de sedes y un único botón «Editar sede» para usuarios con escritura.
- El editor reúne lugar obligatorio, nombre automático de solo lectura, sigla, descripción, sitio y todos los contactos activos, incluyendo etiquetas, fuente y observaciones. Cancelar no escribe.
- `GET/PUT /organizations/:id/branches/:branchId/profile` leen una instantánea y guardan sede/contactos en una transacción con versiones esperadas. El servidor comprueba que la sede pertenece al referente de la ruta; un conflicto en cualquier sección revierte el guardado completo.
- Modificar o quitar un contacto conserva su información histórica. Los correos no se comparten entre propietarios; el contexto se registra en la asociación de la sede.
- Los enlaces antiguos a fichas de contacto de una sede redirigen al perfil de consulta de esa sede. El historial continúa restringido a Administrador.
- No hay cambios de esquema ni migraciones nuevas.

Validación del perfil de sede: 230 pruebas de integración de directorio/contactos/personas correctas; suite general con 955 pruebas de API y 827 de interfaz correctas. Incluye guardado conjunto, contexto de contactos, conservación de antecedentes, conflictos, sede de otro referente, cancelación e historial por rol.
Lint, typecheck y build generales correctos para el perfil de sede; `git diff --check` sin errores.
