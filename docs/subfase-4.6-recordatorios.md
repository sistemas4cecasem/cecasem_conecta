# SUBFASE 4.6 — RESULTADO FINAL

## Estado

SUBFASE 4.6 COMPLETADA

## 1. Baseline

- Rama `main`; HEAD `ed28fb9eadc2a408ae041e064044fb83fdaaaa91`.
- Árbol e índice inicialmente limpios; Fases 0–3 y 4.1–4.5 incorporadas.
- Trabajo exclusivo de 4.6, sin commit ni push.

## 2. Modelo de recordatorio

`ReminderOccurrence` conserva UUID, FK de intención o proceso (exactamente uno),
ancla de inactividad, intervalo y versión de configuración utilizados, vencimiento
y fecha de detección. La procedencia y los snapshots son inmutables.

Un ciclo se identifica por recurso + `inactivityAnchorAt`. PostgreSQL impide
duplicados mediante dos índices únicos, independientemente de cambios de intervalo.

## 3. Definición de inactividad

Ambos modelos ya tienen `lastActivityAt`; se reutilizan sin modificación.
En la intención activa coincide con su creación: sus otras actuaciones vigentes
son cancelación/conversión terminales. No se inventó una edición ni un nuevo ciclo
para una intención que no tiene actividad posterior mientras permanece activa.

El proceso conserva las actuaciones formales aceptadas de Fase 3 y 4.4.
Notas, archivos, oportunidades, derivaciones, lecturas y reuniones futuras no
adquieren semántica de actividad por esta implementación.

`dueAt = inactivityAnchorAt + intervalDays × 86400000`, en UTC. El CHECK SQL
utiliza intervalos de 24 horas; no días calendario dependientes del servidor.

## 4. Configuración

`ReminderSettings` es un singleton persistente, inicializado en 7 días y versión 1.
Solo Administrador activo consulta/modifica. PATCH usa `expectedVersion`, bloqueo
de configuración y credenciales, y transacción con auditoría de anterior/nuevo,
actor, fecha y UUID de operación (`REMINDER_INTERVAL_UPDATED`).

No-op conserva versión y no añade auditoría. Un conflicto devuelve 409.
Se aceptan enteros de 1 a 36500 días: el máximo de 100 años es una cota técnica
para fechas/intervalos, no una regla de negocio.

Cada barrido conserva el snapshot con el que empezó. El siguiente usa la
configuración nueva. Cambiar el intervalo no reescribe ciclos ya detectados.

## 5. Elegibilidad

Intención: únicamente `ACTIVE`. Proceso: estados distintos de `CLOSED`.
No hay un estado de archivo adicional en el modelo vigente.

Restricciones activas aplicables al destino persistido suprimen el recordatorio
ordinario. Se reutiliza ContactRestrictions, sus destinos y sus advisory locks.
No se guarda una occurrence mientras está restringido; al levantar la restricción,
el siguiente barrido puede detectar el ciclo si cumple el umbral vigente.

## 6. Destinatarios

- Intención: su autor activo con permisos de notificaciones, consulta y conversión.
- Proceso: participantes formales persistidos, activos y con permisos de consulta
  y continuación. Se usa `RelationshipProcessesService.notificationParticipants`.
- Ningún rol recibe avisos globalmente. Una nota no agrega participación.
- La occurrence se confirma incluso sin destinatarios. La posterior reactivación
  o incorporación de usuarios no entrega retrospectivamente ese ciclo.
- Usuarios activos seleccionados quedan bloqueados para preservar su rol/estado
  hasta confirmar la transacción; no se exige sesión abierta.

## 7. Scheduler

`ReminderScheduler`, separado del consumidor 4.5, ejecuta al startup y una hora
después de finalizar cada barrido. En entorno test no instala timers automáticos.

Consulta vencidos por ancla y estado; usa cursor compuesto ancla/UUID y lotes de 25.
Los índices nuevos respaldan estado + ancla + UUID. Audiencia, usuarios,
restricciones y ciclos existentes se consultan por lote, sin N+1 de esos datos.

Advisory lock transaccional `(1128612691,47)` por lote; no mantiene transacciones
abiertas entre ejecuciones ni durante esperas del scheduler. Recorre desde el
principio tras reinicio: las occurrences durables son la deduplicación, sin un
checkpoint que pueda omitir permanentemente un ciclo fallido.

Savepoint por candidato: occurrence y notificaciones se confirman juntas o se
revierten juntas. Errores de candidato permiten continuar; errores completos se
registran sin datos privados y se reintentan en la siguiente ejecución, sin
bloquear el arranque de la API.

## 8. Concurrencia

Usuarios se bloquean en orden; destinos se adquieren con advisory try-lock y
recursos con `FOR UPDATE NOWAIT`. Un recurso ocupado se reintenta, evitando esperar
con un orden inverso al de productores formales. Antes del INSERT se comprueban
ancla, estado y destino actuales. El trigger de occurrence respalda estado/ancla.

Actividad o cierre confirmado después de seleccionar un candidato invalida el
candidato anterior. La versión/intervalo de configuración permanece estable para
el barrido aunque Administración cambie la configuración simultáneamente.

## 9. Integración con notificaciones

Tipos `INTENT_INACTIVITY_REMINDER` y `PROCESS_INACTIVITY_REMINDER`.
`Notification.reminderId` tiene FK real a la occurrence; CHECKs y trigger impiden
mezclar fuente de oportunidad/reunión con recordatorio o clasificarlo incorrectamente.
Unicidad adicional destinatario + reminder + tipo y procedencia inmutable.

El módulo Reminders escribe su occurrence y utiliza la interfaz pública de
Notifications para entregar; Notifications obtiene resúmenes mediante
ReminderRecords. Esta separación evita dependencia circular con el scheduler.

Se conserva un solo centro, contador, paginación y lectura. Los enlaces usan
`/contact-intents/:id` y `/relationship-processes/:id` existentes.

## 10. Garantía de no modificación de negocio

Detectar, entregar, leer o configurar recordatorios NO cambia estados,
`lastActivityAt`, versiones de intención/proceso, resultados ni participación.
No crea comunicaciones, notas o actuaciones del timeline.

## 11. API

- `GET /api/v1/settings/reminders`: Administrador, respuesta intervalDays/version.
- `PATCH /api/v1/settings/reminders`: intervalDays/expectedVersion, Admin y auditoría.
- API `/api/v1/me/notifications`, contador y PATCH de lectura reutilizados.
- No existe endpoint público para ejecutar el detector.

## 12. Frontend

Centro existente: etiquetas «Intención sin actividad» y «Proceso sin actividad»,
propósito limitado a 160 caracteres, contexto, ancla UTC, intervalo y navegación.
Lectura fallida conserva navegación y no contamina el caché de otra identidad.

La ruta administrativa `/settings/reminders` y el enlace «Recordatorios» siguen
la superficie de Configuración existente. Formulario RHF/Zod, unidad días, carga,
error, guardado, confirmación y conflicto con recarga. Roles no autorizados no
consultan configuración ni ven su formulario.

## 13. Migraciones

- `20261005060000_reminder_types`: NotificationType y AuditAction.
- `20261005060001_inactivity_reminders`: tablas, FKs, índices, unicidad de ciclos,
  exclusividad de fuentes, checks de fechas/configuración/auditoría y triggers.
- Las 49 históricas se compararon con HEAD y están intactas.
- Cadena 51 desde cero y actualización 49 → 51 verificadas con rol sin superusuario.
  Upgrade conservó intención, proceso, aviso P0 leído y recibo histórico.

## 14. Pruebas

- API: 838 pruebas, 47 suites.
- Frontend: 570 pruebas, 32 archivos.
- Integración PostgreSQL/HTTP: 1193 pruebas, 30 suites.
- Específicas nuevas 4.6: 69 (26 unitarias, 29 integración y 14 frontend).

Incluyen umbral exacto, UTC, configuraciones 7/5/14, terminales, nuevos ciclos,
usuarios inactivos, no-contact, participantes, locks, carreras de actividad/cierre/
configuración, rollback, constraints, privacidad, leído, navegación y formularios.

## 15. Validaciones

| Comando/validación | Resultado |
| --- | --- |
| `corepack yarn lint` | OK |
| `corepack yarn typecheck` | OK |
| `corepack yarn test` | OK; API completa final también ejecutada por workspace |
| `corepack yarn workspace @cecasem-conecta/api test:integration` | OK: 1193 |
| API `test --testPathPatterns=reminder` | OK: 26 |
| Frontend `test notifications-reminders reminder-settings` | OK: 14 |
| Prisma validate | OK |
| Prisma migrate deploy/status, desde cero y upgrade | OK: 51 |
| Prisma migrate diff | Sin diferencias en ambas bases |
| `corepack yarn build` | OK; conserva advertencia de tamaño de bundle preexistente |
| Docker Compose config/build/startup | OK: API/web/db saludables en QA aislado |
| E2E HTTP y reinicio real | OK |
| Navegador escritorio/móvil | OK; capturas externas al repositorio |
| `git diff --check` | OK |

## 16. E2E

Proyecto Docker propio de QA, cinco usuarios sintéticos y base aislada `_test`.
Se crearon recursos por HTTP y se prepararon fechas solo en fixtures de QA.
Los nuevos ciclos y carreras usaron un contexto Nest test con tiempo explícito y
llamadas HTTP reales para actividad/cierre; no se cambió el reloj productivo ni
se añadió una ruta de ejecución.

Default 7 → 5 por HTTP y 5 → 14 por navegador, ambos auditados. Primera detección:
3 occurrences y 3 entregas; sin terminales/no-contact/no participantes. Lectura
de intención y proceso disminuyó contador sin cambiar negocio. Un resultado de
reunión real estableció participación; una reunión futura no suspendió seguimiento.

Nueva actividad generó otro ciclo. Levantar no-contact permitió reevaluar sin
reescribir historia. Reactivar usuario no entregó el ciclo previamente detectado.
Reprocesar y reiniciar la API conservaron 7 occurrences y 8 avisos de recordatorio,
sus lecturas y coexistencia con los avisos P1, sin duplicados.

Escritorio y móvil: centro, enlaces canónicos, badge, formulario Admin y rechazo
de Búsqueda revisados. Ambas superficies móviles sin desbordamiento horizontal.

## 17. Regresiones

Ninguna conocida. Regresión completa 0–4.5 y los nuevos casos pasan. Se adaptaron
expectativas de permisos/campos de auditoría y tipos P1 sin relajar sus garantías.

## 18. Observaciones

Sin pendientes funcionales de 4.6. Las validaciones y los fixtures no se aplicaron
a las bases ni contenedores preexistentes del usuario.

Al finalizar se cerró la sesión sintética, se revocaron sus sesiones y se
desactivaron los cinco usuarios QA, retirando sus hashes de contraseña. Se detuvo
solo el proyecto Docker de QA, preservando sus volúmenes e historia; se retiraron
sus tres archivos temporales privados. Los contenedores existentes siguen activos.

## 19. Decisiones nuevas

Una occurrence por ancla; sin entrega retrospectiva. Supresión por no-contact
sin consumir el ciclo. Configuración con snapshot por barrido y máximo técnico
de 36500 días. Timer horario, lotes de 25 y retry de recursos ocupados. Se reutilizó
lastActivityAt de intención, sin introducir actividad artificial ni snooze.

## 20. Archivos modificados

- Prisma: schema y dos migraciones nuevas.
- API: AppModule, permisos y su test; auditoría; integración de Notifications;
  frontera de inactividad y restricciones en Relationships; configuración tipada
  en Settings; módulo Reminders (registros, reglas, scheduler y pruebas).
- Integración: nuevo `reminders.integration-spec.ts`; compatibilidad tipada P1 y
  expectativas de campos de auditoría en password-reset.
- Web: rutas/navegación, contratos y centro de notificaciones; formulario y tests
  de configuración; tests de recordatorios y adaptación del helper P1; error 409.
- Documentación: este cierre. Sin dependencias, lockfile, env o infraestructura nueva.

## 21. Git final

Cambios exclusivamente de 4.6, sin archivos de secretos/runtime en el diff.
Índice sin staging; `git diff --check` correcto. NO COMMIT / NO PUSH.
Inventario final: 20 archivos modificados y 18 nuevos, 38 en total.

## 22. Recomendación

4.6 puede cerrarse. El repositorio queda preparado para iniciar 4.7 Traducción
cuando se solicite; 4.7 no se implementó en este trabajo.
