# SUBFASE 4.7 — RESULTADO FINAL

## Estado

SUBFASE 4.7 COMPLETADA CON OBSERVACIONES

## 1. Baseline

Rama `main`, HEAD `ed28fb9eadc2a408ae041e064044fb83fdaaaa91`.
Fases 0–3 y 4.1–4.5 incorporadas; 4.6 implementada y validada en el árbol local.
El árbol inicial NO estaba limpio: conservaba 38 archivos de 4.6 sin commit.
Se registró su inventario/hash fuera del repositorio y se preservaron sus cambios.
32 permanecen idénticos y seis reciben ampliaciones necesarias de 4.7: schema,
AppModule, permisos/RBAC/su prueba y cliente API. No se hizo commit ni push.

## 2. Arquitectura de traducción

`TranslationProvider` define nombre técnico y `translate` con texto, origen auto,
destino es y resultado textual con detección opcional. Nest DI registra
`LibreTranslateProvider`; las pruebas de aplicación sustituyen el provider por
un fake. La aplicación no conoce HTTP, URL, API key ni formato del proveedor.

Configuración tipada: `TRANSLATION_ENABLED`, `LIBRETRANSLATE_URL`,
`LIBRETRANSLATE_API_KEY` y `TRANSLATION_TIMEOUT_MS`. Defaults deshabilitado y 10000 ms.
URL inválida o timeout inválido deshabilitan la función sin impedir bootstrap.
No hay comprobación de red al iniciar ni servicio obligatorio en Compose.

## 3. Modelo persistente

`CommunicationTranslation`: UUID, FK Communication, destino, fingerprint fuente,
texto traducido, detección nullable, provider, FK del solicitante y fecha.
Reutiliza `Communication.requestFingerprint`, identidad de la actuación original
consolidada; no crea otro hash ni copia el cuerpo original.

Unicidad comunicación + destino + fingerprint; índice del solicitante. CHECK de
español, hash y texto; trigger comprueba coincidencia con la fuente y protege la
inmutabilidad de la representación exitosa. Sin edición/eliminación por API.

## 4. Original e inmutabilidad

Solo se traduce `bodyOriginal` de SENT/RECEIVED. Permanecen intactos asunto, cuerpo,
fechas, remitente, destinatarios, snapshots, fingerprint, amendments, invalidación,
proceso y participantes. El resultado se almacena y presenta separadamente.

## 5. Provider

Contrato revisado: [LibreTranslate POST /translate](https://docs.libretranslate.com/api/operations/translate/).
JSON con `q`, `source: auto`, `target: es`, `format: text` y API key solo si existe.
Se valida `translatedText`; `detectedLanguage.language` es opcional y no crítico.

Timeout de 10 segundos, decisión técnica configurable entre 100 y 60000 ms.
También limita la lectura del body. No hay retries automáticos. Redirects rechazados.
Status, JSON, texto ausente/vacío/nulo y respuesta excesiva producen error seguro.
Respuesta limitada a 8 MiB; entrada admite los 200000 caracteres del dominio sin
truncar ni imponer una cota menor. URL únicamente de configuración confiable.

El proveedor recibe el cuerpo necesario y los idiomas; no IDs, cookies, sesiones,
correos del usuario ni adjuntos. La API key no se persiste ni se expone al cliente.
No se registran cuerpos originales, traducciones ni secretos en logs.

## 6. Caché y concurrencia

GET consulta PostgreSQL y nunca llama al provider. POST devuelve la representación
existente cuando ya está generada. Dos solicitudes simultáneas pueden hacer dos
llamadas externas; la unicidad y `createMany/skipDuplicates` confirman una sola
fila y ambas respuestas devuelven esa misma representación.

Se acepta duplicar excepcionalmente llamadas simultáneas para evitar claims/leases
innecesarios. No se mantiene ninguna transacción/lock durante HTTP externo.
Después del provider se revalidan usuario y autorización dentro de la transacción
de persistencia. No se guarda una representación si el solicitante fue desactivado.

## 7. Autorización

Administrador, Directorio, Búsqueda y Planificación reciben `translations.read`
y `translations.request`. Guard de sesión y permisos; usuario activo; acceso a
comunicación y proceso, mediante la frontera pública de Communications.

La política vigente permite lectura institucional a los cuatro roles y no exige
participación propia ni titularidad del registro. No se inventa otra restricción.
401 anónimo/inactivo/sesión revocada, 404 inexistente y rechazo cerrado de rol sin
capabilities efectivas probado mediante la frontera HTTP de permisos.

## 8. Fallo no bloqueante

Provider deshabilitado/no configurado: 503 `TRANSLATION_UNAVAILABLE`.
Timeout: 504 `TRANSLATION_TIMEOUT`. Error HTTP/red/respuesta: 503
`TRANSLATION_PROVIDER_ERROR`. Fuente vacía: 422 `TRANSLATION_EMPTY_BODY`.

No se guarda un falso éxito ni se devuelve el original como traducción.
El original y la gestión siguen funcionando; se permite reintentar manualmente.
Las representaciones ya persistidas se consultan aunque el provider esté caído.

## 9. Comunicación invalidada

Puede consultar o generar traducción quien conserve acceso al hecho histórico.
La invalidación, su motivo y los amendments permanecen visibles y separados.
Traducir no reactiva ni rehabilita el registro y no traduce amendments.

## 10. API

- `GET /api/v1/communications/:id/translations/spanish`: 200 con representación
  persistida o JSON `null`, sin red externa.
- `POST /api/v1/communications/:id/translations/spanish`: 200 con resultado nuevo
  o cacheado. El usuario no controla texto, idioma, URL, headers ni API key.
- Ambos usan `Cache-Control: no-store`, UUID y autorización backend.

Contrato: id, communicationId, targetLanguage es, idioma detectado nullable,
translatedText y createdAt. No expone URL, key, headers, respuesta cruda ni stack.

## 11. Frontend

Bloque «Traducción al español» debajo de «Cuerpo original», claramente identificado
como representación de apoyo. GET al abrir; POST solo al pulsar el botón.
Carga/errores/reintento mantienen el original. Traducción existente visible sin
regenerar. Texto representado por React como contenido, sin HTML del provider.

TanStack Query y cliente API central; claves y confirmación de respuesta contemplan
identidad, rol y capabilities. Respuestas tardías no contaminan otra identidad.
Fuente vacía no ofrece solicitud engañosa. Escritorio y móvil revisados.

## 12. Efectos laterales

Traducir NO agrega participación ni concede cierre; NO modifica estado, versión
o lastActivityAt del proceso; NO agrega timeline ni altera cursores; NO produce
notificaciones; NO crea/resuelve/reinicia recordatorios ni altera ReminderOccurrence.
Autor y fecha de la representación constituyen trazabilidad, sin nuevo AuditAction.

## 13. Migraciones

Nueva `20261005070000_communication_translations`, con tabla, FKs restrictivas,
unicidad, índice, checks y trigger de fuente/inmutabilidad.
Las 51 anteriores están intactas, incluidas las dos locales de 4.6.

Cadena final 52 desde cero y upgrade poblado 51 → 52: deploy/status correctos,
diff sin diferencias y rol PostgreSQL sin superusuario. Upgrade conserva fuente,
fingerprint, proceso y auditoría. Se corrigió antes del cierre un nombre de índice
que excedía el límite de PostgreSQL, repitiendo ambas validaciones con SQL final.

## 14. Pruebas

- API: 872 pruebas, 48 suites.
- Frontend: 582 pruebas, 33 archivos.
- Integración: 1208 casos de 31 suites, cobertura final combinada.
- Nuevas 4.7: 61 = 34 de adapter/config + 15 integración + 12 frontend.

Incluyen éxito SENT/RECEIVED, los cuatro roles, timeout/abort incluso body detenido,
500/429, redirects, JSON/texto inválidos, respuesta excesiva, disabled, entrada
máxima, cache, concurrencia, FK/hash/idioma, rollback, invalidación/amendments,
original intacto, efectos laterales, permisos y usuario desactivado durante espera.

## 15. Validaciones

| Comando / validación | Resultado |
| --- | --- |
| `corepack yarn lint` | OK |
| `corepack yarn typecheck` | OK |
| `corepack yarn test` | OK; API completa final también ejecutada por workspace |
| API test `--testPathPatterns=libretranslate` | OK: 34 |
| Web test `communication-translation` | OK: 12 |
| API `test:integration` | OK por cuatro grupos `--runTestsByPath` más suite específica final |
| API integración `--testPathPatterns=translations` | OK: 15 |
| Prisma validate | OK |
| Migrate deploy/status/diff desde cero y upgrade | OK; 52, sin diferencias |
| `corepack yarn build` | OK; advertencia de bundle grande preexistente |
| Docker Compose config/build/startup | OK; entorno propio saludable |
| E2E HTTP y reinicio real | OK |
| Navegador escritorio/móvil | OK |
| `git diff --check` | OK |

La ejecución monolítica de integración agotó el heap de Node. Se repitieron las
31 suites en cuatro procesos por grupos (337 + 295 + 311 + 262), todos correctos,
y se ejecutó nuevamente la suite final de traducción de 15 casos (antes tenía 12).
La cobertura final única es 1193 anteriores + 15 nuevos = 1208. No se alteraron
timeouts globales ni configuración de tests para acomodar resultados.

## 16. E2E

Docker y bases propios `_test`; usuarios y comunicaciones sintéticas creadas para QA.
Búsqueda solicita en navegador; original/traducción visibles y separados. Recarga
y Planificación reutilizan el mismo resultado sin llamadas externas adicionales.

Provider HTTP controlado falla: original visible, error seguro, cero filas falsas;
reintento al recuperarse exitoso. Dos usuarios por HTTP reciben una sola fila
concurrente. Comunicación invalidada admite traducción y conserva invalidación.

Cuatro representaciones confirmadas. Snapshot de originales, fingerprints,
destinatarios, proceso, participación, eventos, auditoría, notificaciones y
recordatorios permanece idéntico. Reinicio real conserva las cuatro filas; GET
posterior devuelve cache y el contador del nuevo proceso fake permanece en cero.
Móvil: ancho y scrollWidth iguales (375 CSS px), sin desbordamiento horizontal.
Capturas guardadas fuera del repositorio. Viewport restaurado; sesión QA cerrada.

## 17. Smoke test LibreTranslate

NO ejecutado contra instancia real: no había servicio configurado/disponible.
Se verificó el adapter contra servidor HTTP controlado con el contrato oficial,
y el E2E Docker usó otro servidor fake en su red privada. Se comprueba transporte,
contrato y degradación, sin afirmar calidad lingüística de un motor real.
Esta ausencia no bloquea 4.7 según el alcance solicitado.

## 18. Regresiones

Ninguna conocida. Suites anteriores 0–4.6 ejecutadas y correctas. Solo se ampliaron
expectativas de permisos y configuración correspondientes a los contratos nuevos.

## 19. Observaciones y pendientes

Sin pendiente funcional de 4.7. Observación de entorno: falta smoke contra motor
LibreTranslate real. El repositorio conserva cambios anteriores sin commit de 4.6.
Las bases y contenedores preexistentes del usuario no recibieron las pruebas.

Al finalizar se revocaron las sesiones y se desactivaron las identidades sintéticas
de las cinco bases propias de QA, retirando sus hashes de contraseña. Se detuvo
solo el proyecto Docker propio, preservando sus volúmenes/historia, y se retiraron
cuatro archivos temporales privados. Los contenedores existentes siguen activos.
Codex y las pestañas conservadas no se cerraron.

## 20. Decisiones nuevas

Destino fijo es, origen auto; reutilizar fingerprint de la actuación consolidada.
Solo persistir éxito; caché institucional compartida; aceptar llamadas simultáneas
duplicadas con deduplicación durable. Timeout 10 s y respuesta 8 MiB, configuraciones
técnicas seguras sin dependencia de red al startup. Invalidada sigue traducible.
No agregar proveedor pesado a Compose, claims, scheduler, cola ni auditoría ruidosa.

## 21. Archivos modificados

4.7: 13 archivos existentes ampliados y 14 nuevos, 27 en total.

- Prisma: schema y migración nueva de traducciones.
- API: módulo Translation, adapter/reglas de configuración/DTO/controller/service/
  filtro y tests; frontera de lectura en Communications; AppModule; permisos/RBAC.
- Configuración: environment y prueba, dos `.env.example`, variables API en Compose.
- Web: bloque y tests de traducción, integración en detalle y cliente de errores.
- Integración: `translations.integration-spec.ts`.
- Documentación: este informe. Sin dependencias ni cambios de lockfile.

## 22. Git final

59 archivos pendientes respecto a HEAD: 27 modificados y 32 nuevos.
Incluyen 38 anteriores de 4.6 y 27 de 4.7 con seis archivos compartidos.
Índice sin staging; diff revisado, whitespace correcto, sin secretos/runtime.
NO COMMIT / NO PUSH.

## 23. Recomendación

4.7 puede cerrarse con la observación del smoke real no disponible.
4.1–4.7 están implementadas; 4.6 y 4.7 continúan sin commit conforme a instrucciones.
El repositorio queda listo para REAUDITORÍA FINAL INDEPENDIENTE DE FASE 4.
NO se declara cerrada formalmente Fase 4 y NO se inicia Fase 5.
