# Detalle de Procesos — experiencia conversacional e institucional

Informe de implementación y validación, 11 de octubre de 2026.

## 1. Resumen

El detalle tiene una cronología principal que integra las fuentes existentes. Se
distinguen comunicaciones enviadas y recibidas, notas internas y acontecimientos
institucionales. Los cuerpos de correo se consultan al expandir cada registro.
Las acciones de registro están al inicio de la cronología. Los recursos se
consultan desde secciones plegables.

## 2. Archivos y responsabilidades

Rutas relativas a la raíz del repositorio.

| Archivo | Responsabilidad |
| --- | --- |
| `apps/web/src/features/relationships/relationship-process-detail-page.tsx` | Resumen, acciones de estado, restricción y composición de las tres zonas. Conserva una cronología administrativa para identidades sin lectura de comunicaciones. |
| `apps/web/src/features/relationships/relationship-timeline.tsx` | Cronología principal, agrupación por día, acontecimientos institucionales, acciones y formulario plegable de nota con conservación del borrador. |
| `apps/web/src/features/relationships/timeline-communication.tsx` | Tarjetas de comunicaciones, procedencia, consulta diferida, cuerpo literal, errores y enlaces al detalle. |
| `apps/web/src/features/relationships/process-context-panel.tsx` | Participantes e índices de archivos, reuniones, oportunidades y comunicaciones; montaje bajo demanda y apertura mediante `#adjuntos`. |
| `apps/web/src/features/relationships/process-detail.css` | Jerarquía, tarjetas diferenciadas, superficies institucionales, textos extensos y distribución responsiva. |
| `apps/web/src/features/relationships/timeline-contracts.ts` | Validación de autoridad histórica en el contrato cronológico. |
| `apps/web/src/features/relationships/timeline-queries.ts` | Solicitud descendente y separación de su caché; conserva invalidaciones por identidad y proceso. |
| `apps/web/src/features/relationships/contact-restriction-notice.tsx` | Advertencia contextual del proceso, conservando el mensaje de otros usos. |
| `apps/web/src/features/communications/queries.ts` | Parámetro opcional para activar la lectura del detalle bajo demanda, con los permisos y la clave de caché existentes. |
| `apps/api/src/modules/relationships/timeline.dto.ts` | `authority` en acontecimientos administrativos y parámetro `order=asc\|desc`. |
| `apps/api/src/modules/relationships/timeline.rules.ts` | Predicados de búsqueda en ambas direcciones y cursores vinculados al proceso y dirección. |
| `apps/api/src/modules/relationships/relationship-timeline.service.ts` | Propagación del orden a las fuentes y mezcla global determinista dentro de la transacción existente. |
| `apps/api/src/modules/relationships/relationship-processes.service.ts` | Proyección de autoridad y consulta de acontecimientos en la dirección solicitada. |
| `apps/api/src/modules/relationships/internal-notes.service.ts` | Dirección del recorrido de notas. |
| `apps/api/src/modules/communications/communications.service.ts` | Dirección del recorrido de comunicaciones, manteniendo la proyección sin cuerpos. |
| `apps/api/src/modules/communications/communication-amendments.service.ts` | Dirección del recorrido de correcciones, observaciones e invalidaciones. |
| `apps/api/src/modules/files/files.service.ts` | Dirección del recorrido de lotes de adjuntos. |
| `apps/api/src/modules/referrals/referrals.service.ts` | Dirección de las dos consultas acotadas de derivaciones. |
| `apps/api/src/modules/meetings/meetings.service.ts` | Dirección de las dos consultas acotadas de acontecimientos de reuniones. |
| `apps/api/src/modules/relationships/timeline.rules.spec.ts` | Compatibilidad del cursor y comparación exhaustiva de predicados con la tupla de orden para las siete fuentes. |
| `apps/api/test/relationship-timeline.integration-spec.ts` | HTTP/PostgreSQL: recorrido descendente, empates, siete fuentes, inserciones, dirección del cursor y autoridad. |
| `apps/web/src/features/relationships/relationship-timeline.test.tsx` | Consulta diferida, carga/error/reintento, texto literal, autoridad, recursos, notas, permisos y paginación. |
| `apps/web/src/features/relationships/process-context-panel.test.tsx` | Índices bajo demanda, filtro de oportunidades, conservación de página, ancla privada y permisos. |
| `apps/web/src/features/relationships/relationship-processes.test.tsx` | Organización sin duplicaciones, restricción activa y adaptación de la cronología administrativa restringida. |
| `apps/web/src/features/communications/sent-communications.test.tsx` | Conservación del índice vacío y paginado mediante su apertura explícita. |
| `apps/web/src/features/communications/received-communications.test.tsx` | Índice secundario y acción recibida en proceso cerrado. |
| `apps/web/src/features/communications/communication-amendments.test.tsx` | Invalidación reflejada en la nueva región cronológica. |
| `docs/process-detail-redesign.md` | Decisión temporal, alcance y evidencia de validación. |

## 3. Organización visual

1. Encabezado y resumen: propósito, actor, estado, creador, creación, última
   actividad formal, origen y cierre cuando corresponden. Las acciones de estado
   conservan formularios, confirmaciones, concurrencia y autoridad contextual.
2. Cronología: acciones de registro arriba, actividad reciente y separadores de
   día. Enviadas con azul y superficie suave; recibidas con borde verde; notas
   con borde discontinuo e indicador «Solo CECASEM»; acontecimientos compactos.
3. Contexto: participantes abiertos inicialmente; archivos, reuniones,
   oportunidades e índice de comunicaciones plegados. En tablet y móvil se
   distribuyen verticalmente.

## 4. Frontend y backend

El frontend reutiliza TanStack Query, formularios y componentes existentes.
El remitente real se muestra separado del registrador y la fecha efectiva se
distingue de la fecha de registro. El cuerpo se representa como texto literal
con saltos de línea y desplazamiento vertical acotado; no se interpreta HTML.
El extracto aparece después de haber consultado el cuerpo, aprovechando la caché.
Volver a expandir puede actualizar el detalle según la política de caché vigente.

El backend incorpora autoridad al contrato y permite elegir dirección del
recorrido. Se mantienen las fuentes, transacciones, límites y autorizaciones.
No se modificaron Prisma, migraciones, permisos, reglas de participación,
inmutabilidad, auditoría ni mecanismos de envío o sincronización.

## 5. Orden temporal y cursores

La pantalla solicita `order=desc` y 25 elementos por página. Todas las fuentes
ordenan y filtran en esa dirección antes de aplicar su límite. El agregador
mezcla por `(occurredAt, registeredAt, source, id)` y devuelve la primera página
global. «Cargar acontecimientos anteriores» continúa desde la última tupla.

El cursor queda vinculado al proceso y dirección. Un cursor descendente en una
consulta ascendente, o de otro proceso, se rechaza. El endpoint mantiene `asc`
como valor predeterminado y acepta los cursores anteriores sin dirección como
ascendentes. No se invierte visualmente una página parcial.

Una inserción posterior al cursor en la dirección elegida puede aparecer en la
página siguiente. Una inserción antes de la posición ya recorrida se recupera
con «Actualizar historial». Las fechas de hechos retrospectivos conservan su
posición efectiva; no se desplazan artificialmente a la fecha de registro.

## 6. Secciones conservadas y sustituidas

El historial administrativo separado se sustituye por sus acontecimientos con
autoridad en la cronología completa. Su almacenamiento y auditoría permanecen.
Para identidades sin `communications.read` se conserva como única cronología
administrativa accesible, sin solicitar el timeline protegido.

El índice de comunicaciones queda bajo demanda porque conserva navegación y
paginación por comunicaciones. Archivos y reuniones mantienen índices y flujos
autorizados. Oportunidades usa el filtro existente `processId`; no se añade una
nueva fuente de acontecimientos. Las notas continúan permitidas en cerrado sin
otorgar participación, y las recibidas no reabren automáticamente el proceso.

## 7. Comprobaciones técnicas

Ejecutadas con Node 24.19.0 y Yarn 4.18.1. El ejecutable Yarn 4 se utilizó desde
un archivo temporal porque el comando global del equipo corresponde a Yarn 1.

| Comprobación | Resultado |
| --- | --- |
| `yarn lint` | Pasa. |
| `yarn typecheck` | Pasa. |
| `yarn build` | Pasa; Vite advierte sobre el tamaño del chunk principal (824,67 kB). |
| `yarn test` | La raíz se detiene en API: 50 suites pasan y 6 fallan; 930 pruebas pasan y 21 fallan. |
| `yarn workspace @cecasem-conecta/web test` | 43 suites pasan y 3 fallan; 844 pruebas pasan y 39 fallan. |
| `yarn workspace @cecasem-conecta/web test src/features/relationships src/features/communications` | 10 suites, 267 pruebas: todas pasan. |
| `yarn workspace @cecasem-conecta/api test --testPathPatterns=timeline.rules` | 21 pruebas: todas pasan. |
| Integración focal PostgreSQL/HTTP | 6 suites, 259 pruebas: todas pasan, usando exclusivamente `cecasem_conecta_test`. |

La integración focal incluye procesos, timeline, comunicaciones enviadas y
recibidas, restricciones y correcciones/invalidaciones. Los datos de cada prueba
se eliminan mediante la limpieza existente de la suite, ampliada para las
fuentes incluidas en el nuevo caso; no se realizaron migraciones.

En una copia temporal limpia de `HEAD` se reprodujeron 19 fallos de las mismas
seis suites del backend y los 39 del frontend. Los dos fallos adicionales de la
última ejecución de API pertenecen a las pruebas inalteradas de contraseña:
generan aleatoriamente una cadena base64url que puede no incluir el símbolo
exigido por la política actual. El fallo de política Unicode y los desajustes
de primer acceso, recuperación, autorización y usuarios son ajenos al rediseño.

## 8. Validación funcional y visual

Las pruebas cubren creación, enviada, enviada/recibida, notas, cambios de estado,
cierre, recibida posterior al cierre, reapertura, invalidación, reuniones,
archivos, historial paginado, restricción activa y capacidades diferentes.
Se verifica la conservación de las fechas, originales y autoridad, así como
la ausencia de participación por agregar una nota.

Se revisó la aplicación React/Vite real en navegador con respuestas de API de
prueba en memoria, aisladas del servidor institucional:

| Tamaño | Revisión y evidencia |
| --- | --- |
| 1440 × 900 | Resumen, dos columnas, acciones, notas, comunicaciones y cuerpo expandido. Ancho del documento: 1425 px, sin desbordamiento horizontal. |
| 768 × 1023 | Distribución vertical y formulario de nota. Ancho del documento: 753 px. |
| 390 × 843 | Cuerpo extenso con saltos, metadatos, controles y contexto plegable. Ancho del documento: 375 px. |

La diferencia de 15 px corresponde a la barra vertical del navegador. Se
comprobó el recorrido de 25 a 30 acontecimientos, el final del historial y que
el enlace de adjuntos despliega su índice privado. Las capturas se conservan
fuera del repositorio en la carpeta de evidencias de Codex.

## 9. Limitaciones y observaciones

La suite general permanece bloqueada por fallos ajenos a esta intervención;
no se declara verde el conjunto del proyecto. La revisión visual inicial utilizó
respuestas sintéticas. La comprobación autenticada posterior de carga y descarga
con datos no productivos se documenta en el apartado de pulido final. No se
utilizaron datos institucionales reales.

El frontend y la API deben desplegarse juntos para disponer de `authority` y
`order=desc`. Los extractos no se solicitan anticipadamente: quedan disponibles
después de consultar cada cuerpo. Las oportunidades siguen siendo un índice
contextual, sin nuevos acontecimientos cronológicos.

## 10. Estado de Git

El estado inicial del rediseño estaba limpio. El rediseño inicial comprendió 24
archivos existentes modificados y 4 archivos nuevos, incluido este informe. El
pulido conserva ese trabajo y deja 26 archivos existentes modificados y los
mismos 4 archivos nuevos. No se creó ningún
commit ni se realizó push. La revisión final del diff incluye whitespace,
alcance y ausencia de secretos, archivos de entorno, migraciones y datos de
ejecución entre los cambios.

## Pulido visual final

Se revisó la misma experiencia aprobada, conservando los contratos, permisos,
reglas, dirección de cursores, sidebar y topbar.

### Problemas y correcciones

- Las paginaciones se envolvían en tres líneas sin un orden deliberado. Ahora
  usan el ancho de su contenedor: en paneles estrechos el contador va arriba y
  los dos botones en una fila; cuando hay espacio, los tres elementos comparten
  una fila. En una sola página se conserva el contador y se ocultan los botones
  deshabilitados; en índices vacíos se omite la paginación visible.
- El selector nativo comprimía su botón y el nombre del archivo. La presentación
  compacta utiliza la entrada nativa con un control visible de ancho disponible,
  foco de teclado y estado de selección asociado. Los nombres completos aparecen
  en la lista. Esta presentación se activa solamente en el contexto del proceso.
- Los botones de descarga repetían nombres extensos. Muestran «Descargar archivo»
  y conservan el nombre completo en su etiqueta accesible y en el registro.
- Se eliminaron bordes y títulos visuales anidados dentro de las secciones ya
  tituladas, y se redujo el espaciado de estados vacíos. Los estilos están
  limitados al detalle del proceso.
- El asunto tiene mayor jerarquía; dirección y procedencia conservan su lectura.
  La vista previa consultada se limita a 240 caracteres y compacta espacios y
  saltos de línea. El cuerpo completo conserva íntegramente el texto original.
  Se mantienen carga, error, reintento, caché y consulta diferida.

### Archivos intervenidos en el pulido

| Archivo | Ajuste |
| --- | --- |
| `apps/web/src/features/relationships/process-detail.css` | Paginación por contenedor, densidad del panel, selector, foco y jerarquía de comunicaciones. |
| `apps/web/src/features/relationships/process-context-panel.tsx` | Activa la presentación compacta de adjuntos exclusivamente en el panel. |
| `apps/web/src/features/relationships/timeline-communication.tsx` | Vista previa compacta y mensajes específicos de carga/error. |
| `apps/web/src/features/files/attachments.tsx` | Presentación compacta opcional, nombres completos y etiqueta accesible de descarga. |
| `apps/web/src/features/files/attachments.test.tsx` | Selección nativa, foco, nombre extenso, carga y bloqueo en cerrado en presentación compacta. |
| `apps/web/src/features/relationships/relationship-timeline.test.tsx` | Original con múltiples saltos y cadena sin espacios; vista previa acotada y cuerpo literal. |
| `docs/process-detail-redesign.md` | Actualización de evidencia y estado final. |

### Validaciones y comparación con el baseline

- `yarn workspace @cecasem-conecta/web lint`: pasa.
- `yarn workspace @cecasem-conecta/web typecheck`: pasa.
- `yarn workspace @cecasem-conecta/web build`: pasa; permanece la advertencia del
  chunk principal, ahora de 825,38 kB.
- Antes del pulido: relaciones, comunicaciones y archivos, 11 suites y 281
  pruebas aprobadas.
- Después del pulido: las mismas 11 suites y 283 pruebas aprobadas, incluyendo
  dos casos nuevos de presentación compacta de adjuntos.
- Suite completa de frontend: 43 suites aprobadas, 3 fallidas; 846 pruebas
  aprobadas y los mismos 39 fallos de autenticación del baseline. Se compararon
  los nombres de los casos fallidos con la ejecución anterior, sin diferencias.
  Esas suites no se modificaron. No se identificaron regresiones nuevas.
- Los archivos de API se compararon con su contenido al inicio del pulido y
  permanecen intactos. No se volvió a ejecutar la suite del backend en este
  ajuste de presentación.

### Navegador, teclado y adjuntos reales de prueba

Se utilizó la aplicación real con la API NestJS y PostgreSQL existentes,
apuntando exclusivamente a `cecasem_conecta_test`, con una identidad temporal
propia y almacenamiento privado temporal. Se inició sesión desde el formulario
normal. Los registros y archivos fueron preparados para esta comprobación.

- **1440 × 900:** selector y nombres completos legibles; paginación de 26 y
  posteriormente 27 adjuntos distribuida en contador y fila de botones en el
  panel estrecho; comunicaciones enviadas/recibidas con jerarquía conservada.
- **768 × 1023:** contexto vertical; paginación en una fila gracias al ancho del
  contenedor; selector con foco visible. Documento de 753 px, sin desbordamiento.
- **390 × 843:** contador sobre los botones; selector completo y nombres con
  ajuste de línea; estados vacíos compactos y cuerpo extenso. Documento de
  375 px, sin desbordamiento.
- **Teclado:** Tab llega a la entrada nativa y destaca el control visible; Enter
  abre el índice plegable de comunicaciones.
- **Contenido:** 127 líneas, saltos consecutivos y cadena larga sin espacios;
  ancho interior y ancho desplazable del cuerpo de 261 px. El texto con etiquetas
  se conserva literal y no produce elementos `script`. Al expandir no se duplica
  la vista previa. Carga/error/reintento y caché también se comprobaron en pruebas.
- **Carga:** archivo `.txt` de prueba con nombre extenso incorporado desde el
  navegador; el índice cambió de 26 a 27 registros y limpió la selección.
- **Descarga:** comparación byte por byte con el archivo original aprobada.
  También se descargó el adjunto anterior de un proceso cerrado y se comprobaron
  sus bytes. En cerrado no se presenta el selector ni la acción de carga.

Las identidades, procesos, comunicaciones, notas, cuentas y metadatos temporales
se eliminaron exclusivamente de la base `_test` después de la revisión. También
se retiraron los 28 objetos privados y las credenciales temporales de prueba. Las
capturas se conservaron fuera del repositorio en
`C:/Users/Desktop/.codex/visualizations/2026/10/11/process-detail-polish`.
Permanecen pendientes los fallos generales y la advertencia de tamaño de bundle
ya descritos; no se encontraron problemas adicionales del pulido.
