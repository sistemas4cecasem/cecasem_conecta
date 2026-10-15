# Organizaciones: áreas de interés (2026-10-15)

Esta decisión reemplaza el catálogo de categorías y sus filtros descritos en fases anteriores.

- Cada organización y sede tiene `interestAreas: string[]`, opcional al crear o reemplazar la ficha; omitirlo o enviar `[]` deja el arreglo vacío.
- PostgreSQL almacena los valores en `Organization.interestAreas` (`text[]`, predeterminado `[]`). No hay catálogo ni identificadores de área.
- El formulario permite añadir con botón o Enter y quitar individualmente. El texto pendiente también se incluye al guardar.
- Se normalizan espacios, se omiten repeticiones sin distinguir mayúsculas y se conservan los acentos. Máximo: 100 áreas, 150 caracteres cada una; valores vacíos o de otros tipos se rechazan.
- La creación y edición mantienen los permisos del directorio, la versión esperada, los valores anteriores/nuevos y la autoría en historial.
- La consolidación conserva las áreas del principal y añade las ausentes del duplicado. Bloquea una unión que exceda el límite.
- El listado y resumen muestran las áreas. La exportación XLSX incluye una hoja «Áreas de interés» con una fila por área y organización.
- Se retiran la página, enlaces, consultas y API `/categories`. Los filtros `categoryId` y `organizationCategoryId` ya no se aceptan en organizaciones, búsqueda ni exportaciones.

## Migración

`20261015120000_organization_interest_areas` copia los nombres previamente asociados a cada organización (también categorías inactivas) al arreglo y renombra las tablas anteriores a `ArchivedCategory` y `ArchivedOrganizationCategory`. Las claves foráneas y eventos históricos permanecen intactos. La aplicación activa no consulta ni modifica esas tablas. Las referencias históricas se muestran desde sus snapshots; no se reinterpretan como eventos de áreas.

Aplicar con `yarn workspace @cecasem-conecta/api prisma:migrate:deploy` antes de arrancar el backend actualizado. No se deben ejecutar versiones anteriores del backend tras aplicar esta migración.

## Validación realizada

- `yarn lint`, `yarn typecheck`, `yarn build`, `yarn demo:test` y validación de Prisma: correctos.
- Migraciones aplicadas en una base PostgreSQL aislada, sin diferencias frente al esquema Prisma. 153 pruebas de integración de directorio, historial, filtros, duplicados y exportación correctas, incluida la preservación de datos al migrar.
- `yarn test`: API 955 correctas; web 804 correctas y 8 fallidas en `people.test.tsx`. Las mismas 8 fallan al ejecutar ese archivo sobre una copia limpia de HEAD anterior al cambio: el formulario de personas ya no expone los controles antiguos esperados por esas pruebas. Queda fuera de este reemplazo de categorías.
- Migración aplicada también a la base local de desarrollo. No se desplegaron imágenes Docker.
