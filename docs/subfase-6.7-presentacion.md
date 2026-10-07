# Subfase 6.7 — Guía de presentación

## Objetivo narrativo

Contar una sola historia: antes del contacto, Búsqueda encuentra los antecedentes; el proceso conserva lo que hicieron Diego y Pedro; Planificación recibe el contexto de la respuesta y continúa con una oportunidad y una reunión; Directorio puede consultar el estado compartido. El valor es continuar el trabajo institucional sin depender de la memoria de quien inició la gestión.

Duración sugerida: 8–10 minutos. Entorno: demo local en `http://127.0.0.1:8087`, con datos ficticios únicamente.

## Datos demo

- Organización: **Fundación Horizonte Comunitario Demo**, Bolivia; activa y nunca verificada.
- Persona: **Ana Contacto Demo**, vinculada como Coordinadora de programas Demo. Su correo ficticio `ana@horizonte.example.test` está registrado y pendiente de verificación.
- Proceso: **Explorar talleres ficticios de aprendizaje comunitario…**, en preparación, iniciado por Diego Búsqueda Demo.
- Historial: propuesta enviada por Diego; respuesta recibida y registrada por Pedro Seguimiento Demo; nota interna posterior de Pedro. La oportunidad y la reunión están enlazadas al mismo proceso.
- Oportunidad: **Convocatoria ficticia de talleres comunitarios**, en preparación; fecha límite 5 de noviembre de 2026; deriva de la respuesta registrada.
- Reunión: **Revisar el calendario ficticio de talleres y asignar próximos pasos**, programada para el 20 de octubre de 2026 a las 10:30, `America/La_Paz`; incluye a Diego, Pedro y Ana.
- Alternativa de prevención: **Colectivo Umbral Claro Demo**, con restricción ficticia activa de no contactar.

Todos los correos y enlaces usan dominios reservados para pruebas. CECASEM Conecta registra comunicaciones; no envía ni sincroniza correo.

## Recorrido principal

| # | Rol | Pantalla | Acción y qué mostrar | Mensaje |
|---|---|---|---|---|
| 1 | Búsqueda | Directorio → ficha de la organización | Abrir Fundación Horizonte Comunitario Demo. Mostrar persona vinculada, correo institucional, estado activo y verificación pendiente. | “Empezamos con una ficha compartida y sabemos qué dato sigue pendiente de corroborar.” |
| 2 | Búsqueda | Directorio → Búsqueda global | Desde la lista de organizaciones, abrir Búsqueda global. Buscar la organización y luego Ana Contacto Demo. Mostrar el proceso relacionado y su vínculo institucional. | “Antes de escribir, podemos identificar el contexto de la persona y la institución.” |
| 3 | Búsqueda | Búsqueda global → correo | Buscar el correo ficticio completo. Mostrar el último contacto válido, quién lo registró, la fecha y las comunicaciones de Diego y Pedro. | “El correo permite reconstruir si hubo contacto, quién intervino y cuándo.” |
| 4 | Búsqueda | Proceso de relación | Abrir el proceso desde los antecedentes. Mostrar propósito, actor principal, estado, creador, participantes y línea de tiempo. | “Aquí está concentrada toda la relación.” |
| 5 | Búsqueda | Conversación / Historial | Mostrar una comunicación enviada y una recibida, identificando a Diego y Pedro; después la nota interna de Pedro, claramente distinguida. No abrir formularios de edición. | “La nota es interna, no se envió al contacto. El original de las comunicaciones permanece en el historial.” |
| 6 | Búsqueda | Enlace de oportunidad desde el proceso | Abrir la oportunidad. Mostrar organización, proceso y comunicación de origen, estado En preparación y fecha límite. | “La respuesta deja de ser solo un correo registrado y pasa a una tarea que otra área puede gestionar.” |
| 7 | Planificación | Panel institucional y notificaciones | Cerrar la sesión de Búsqueda; iniciar Planificación manualmente. Mostrar que hay 0 avisos sin leer y que «Nueva oportunidad» permanece como leída en el centro. | “La siguiente área recibió el aviso; el estado leído no borra su historial ni su navegación.” |
| 8 | Planificación | Oportunidad | Abrir la misma oportunidad desde el aviso o desde Oportunidades. Mostrar estado, fecha límite y enlaces al proceso y a la respuesta. No cambiar el estado. | “Planificación trabaja sobre el mismo origen y conserva la trazabilidad.” |
| 9 | Planificación | Reunión vinculada | Abrir la reunión. Mostrar fecha, hora, zona `America/La_Paz`, vínculo con oportunidad/proceso y las tres personas participantes. | “La relación continúa más allá del correo y sigue conectada al mismo contexto.” |
| 10 | Directorio | Panel institucional | Cerrar Planificación e iniciar Directorio. Mostrar solo los indicadores de procesos, oportunidades y reuniones. | “Directorio puede consultar qué se gestiona sin depender de preguntar individualmente.” |

## Pasos esenciales

La historia completa utiliza los pasos 1–10. Si el tiempo es corto, el paso 2 puede limitarse a la búsqueda por organización y persona, y el paso 3 puede llevar directamente desde el correo a sus antecedentes. Mantener la transición Búsqueda → Planificación → Directorio.

## Pasos opcionales

- En la ficha de la organización, mostrar brevemente la candidata de nombre similar y explicar que requiere decisión humana; no fusionarla.
- En Procesos → crear proceso, seleccionar **Colectivo Umbral Claro Demo** y mostrar **RESTRICCIÓN ACTIVA — NO CONTACTAR** junto al botón de guardado deshabilitado. Volver al listado sin guardar nada.
- Mostrar el adjunto de control de 6.6 solo si preguntan por archivos privados; su nombre `qa-6.6-local-upload-control.txt` es técnico y conviene omitirlo en la historia principal.
- En una demostración secundaria, mostrar el preview del Excel sintético y aclarar que conserva filas pendientes o inválidas. No confirmar otra importación; la categoría propuesta no se mapea automáticamente.

## Plan B

- Si el aviso ya está leído, abrir Notificaciones y mostrar la pestaña/lista de leídas; si no está disponible, entrar a Oportunidades desde el panel y abrir la oportunidad por su nombre.
- Si el orden de búsqueda cambia, usar el nombre exacto o el correo completo y leer el total de cada grupo; abrir el proceso por su propósito, no por su posición.
- Si expira una sesión, volver al acceso e introducir la cuenta correspondiente manualmente; reanudar desde Búsqueda global, Oportunidades o Reuniones. No compartir credenciales por chat.
- Si una pantalla tarda, esperar su estado de carga y usar **Reintentar** si aparece un error. Como ruta corta, volver al panel institucional y abrir el proceso o la oportunidad desde sus enlaces.
- Si un registro ya cambió, presentar el estado actual y seguir sus vínculos de origen. No alterar la base de datos ni regenerar datos durante la presentación.

## Observaciones del ensayo

- La ficha principal está activa, pero la organización, el vínculo y los medios de contacto aparecen como **Nunca verificado**; describirlo como pendiente, no como dato corroborado.
- El correo de Ana está asociado a su persona. La consulta por correo separa esa asociación del historial que acredita comunicaciones registradas.
- Búsqueda por organización devuelve el proceso; por persona, la asociación institucional; por correo, dos comunicaciones: la enviada por Diego y la respuesta recibida por Pedro. La búsqueda separa la asociación del contacto del antecedente de comunicación.
- La restricción de no contacto se muestra en rojo al seleccionar Colectivo Umbral Claro Demo para un proceso y deshabilita **Guardar proceso**; la demostración no crea ni modifica registros.
- El proceso contiene además una nota interna de Pedro del 7 de octubre, posterior a la última actuación formal del 6 de octubre. La nota está marcada como interna y explica que no constituye contacto externo. El rótulo de actividad formal debe conservar esta distinción.
- La reunión es futura para el ensayo del 7 de octubre de 2026. Revisar la fecha si la presentación se posterga más allá del 20 de octubre.
- El aviso de Planificación está leído y el contador de no leídas está en cero; mostrar el registro leído y su botón de navegación, sin presentarlo como aviso pendiente.
- Búsqueda y Directorio muestran un contador de 2 avisos sin leer en la cabecera. No se abrió ese centro durante el relato para mantener el foco; mostrar solo los indicadores del panel de Directorio.
- No se observaron errores visibles en el recorrido de Búsqueda; oportunidad y reunión abrieron desde sus vínculos.
