# Subfase 2.2 — Personas

## Base y alcance

Base versionada: `0f4e9eb7f8793eb33bf3ce79e24342339457ea52`, ocho migraciones de 2.1.
El commit local de 2.1 fue autorizado expresamente. Al cerrar 2.2, sus cambios
quedaron sin commit ni push; después se autorizó un commit local como baseline
de 2.3, sin push. No hay cambios de capabilities ni dependencias.

`Person` representa una persona externa, distinta de `User`. Solo exige
`displayName`; `givenNames` y `familyNames` son opcionales. No se calculan ni
inventan apellidos y no existe una FK de organización en la ficha.
Creación/edición/estado conservan `lastVerifiedAt` nulo. No hay acción de verificación.

## Vínculos y episodios

`PersonOrganizationRelation` tiene UUID propio y FK RESTRICT a Person y
Organization. Persona y organización son inmutables en una corrección: elegir
otras corresponde a registrar un episodio distinto. No existe UNIQUE(personId,
organizationId) ni límite de vínculos simultáneos. Admite volver a la misma
institución y registrar varios episodios/cargos, incluso simultáneos.

Cargo textual opcional, área/función opcional, vigencia `isCurrent`, fechas
inicial/final opcionales, descripción de fuente, URL http/https opcional y
observaciones. No se crea catálogo de cargos ni entidad genérica Source.
La URL de fuente describe evidencia; no es un medio de contacto de 2.3.

Fechas completas opcionales YYYY-MM-DD se almacenan como DATE y se devuelven
como fecha de calendario, sin conversión de zona horaria. Se validan fechas
reales, años 0001–9999 y comienzo <= fin cuando ambos se conocen.
Un vínculo vigente no admite fecha final; uno histórico puede tener fin
desconocido. No se sustituye desconocimiento con la fecha actual ni otras fechas.
Se eligió esta estructura sencilla: el alcance no exige conservar precisión
parcial año/mes. Si solo se conoce una referencia temporal incompleta, puede
conservarse en observaciones; los campos de fecha permanecen vacíos.

La UI distingue **Corregir episodio**, **Finalizar vínculo** y **Registrar nuevo
episodio**. Corregir repara datos del mismo hecho, incluida vigencia incorrecta;
un cambio real de cargo se registra como episodio nuevo. Crear un episodio no
finaliza automáticamente otros: la simultaneidad es válida.
Finalizar requiere confirmación explícita en la UI y permite fecha desconocida.
Con versión vigente, repetir finalización es no-op, conservando la fecha previa.
Una fecha incorrecta se corrige explícitamente; una versión antigua recibe 409.

Inactivar persona u organización no modifica ni elimina sus episodios. Se
permiten registrar episodios para fichas inactivas, por ejemplo al completar
historia institucional; la interfaz identifica su estado. No existe borrado ordinario.

## Historial, auditoría y concurrencia

Se extiende **DirectoryChange**, sin segundo sistema de historial. Objetivo único
entre organización, categoría, persona o vínculo, con FK real, autor, operación
UUID, valores JSON tipados y diferencia anterior/nuevo. Se reutilizan el servicio,
la paginación y la interfaz de historial de 2.1. Fechas históricas se guardan como
strings YYYY-MM-DD o JSON null. La creación se reconoce por identidad y timestamp
del episodio; no se presenta como reemplazo del anterior.

Persona y vínculo usan `expectedVersion`, lock de fila y aumento de versión solo
ante cambio efectivo. Corrección/finalización/estado, historial y auditoría se
confirman juntos o hacen rollback juntos. No-op no fabrica eventos.
Se añaden PERSON_UPDATED, PERSON_STATUS_CHANGED, PERSON_RELATION_UPDATED y
PERSON_RELATION_ENDED a AuditEvent, con objetivos concretos y operación común.
Las constraints conservan todas las familias de Fase 1 y 2.1.

El frontend conserva una instantánea de versión al comenzar a editar/finalizar.
Ante 409 conserva el borrador, no reenvía, advierte el descarte y permite recarga
explícita. Una recarga fallida tampoco descarta el borrador.
Las consultas de personas/vínculos comparten las claves por identidad del
directorio; las mutaciones invalidan esa identidad y logout elimina la caché.

## API y RBAC

Base `/api/v1`; DTO estrictos, UUID, proyecciones públicas y errores de 2.1.
GET autenticados incluyen Cache-Control: no-store. No se exponen _count, hashes,
payloads técnicos ni modelos User como personas externas.

| Método / ruta | Operación |
| --- | --- |
| GET /people | Personas paginadas, filtro name/status |
| POST /people | Crear independiente |
| GET /people/:id | Ficha y cantidad de vínculos vigentes |
| PUT /people/:id | Reemplazar campos de ficha con versión |
| PATCH /people/:id/status | Estado administrativo |
| GET /people/:id/history | Historial de ficha |
| GET /people/:id/relations | Episodios paginados |
| POST /people/:id/relations | Episodio nuevo |
| GET /organizations/:id/people | Episodios desde organización |
| GET /person-organization-relations/:id | Episodio concreto |
| PUT /person-organization-relations/:id | Corrección con versión |
| PATCH /person-organization-relations/:id/end | Finalización con versión |
| GET /person-organization-relations/:id/history | Historial del episodio |

PUT reemplaza los campos editables; opcionales omitidos se vacían. La UI envía
la ficha completa. En vínculos `isCurrent` predeterminado true en DTO; para
conservar un episodio histórico se envía false. IDs de persona/organización
no son aceptados en correcciones. End solo acepta expectedVersion/endDate.

Personas usa status active/inactive/all, predeterminado active. Vínculos usa
current/historical/all, predeterminado all. Página predeterminada 1, tamaño 25,
máximo 100. Orden personas displayName+id; episodios createdAt desc+id desc.
Fechas, estados y verificación no son entradas de ficha ordinaria.

Los cuatro roles reutilizan directory.read, directory.write y
directory.history.read. Finalizar/corregir un episodio es escritura ordinaria.
directory.status.update mantiene únicamente Administrador para fichas.
Servicios revalidan actor activo/permiso vigente en la transacción.

Rutas UI: /people, /people/new, /people/:id; acceso desde Directorio.
Ficha de organización incorpora Personas vinculadas con vigencia e historia.

## Migraciones y QA

1. `20261002201000_people_relations`: modelos, FK, enum e índices generados con Prisma.
2. `20261002201100_people_constraints`: integridad temporal, historial y auditoría;
   usa los nuevos valores del enum después de confirmar la primera migración.

No se editan migraciones anteriores. `migrate deploy`, nunca `db push`.
Se amplió el validador de migraciones existente, sin infraestructura duplicada:

```text
node infra/development/validate-directory-migrations.cjs
```

Con DATABASE_URL local aislada terminada en _test, crea dos bases propias para
limpia 0→2.2 y upgrade 8→2.2. Compara once tablas previas incluyendo asociaciones,
jerarquía e historial 2.1. Elimina solo bases y staging temporales que creó.
`--phase=2.1` conserva la comprobación histórica 6→8.

Validación: reglas/episodios unitarios, PostgreSQL real y HTTP con permisos,
coherencia temporal, FK, rollback y concurrencia; frontend con independencia,
episodios múltiples, corrección/finalización, conflictos, historial y caché.
No implementa contactos ni funcionalidades de 2.3+.
