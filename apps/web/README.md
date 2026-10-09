# CECASEM Conecta — Frontend

SPA React + TypeScript + Vite. Consulta la identidad actual antes de mostrar el
área autenticada e incluye administración de usuarios y funcionalidades de negocio.

## Desarrollo

Desde la raíz del monorepo, con Node 24.x y Yarn 4.18.1:

```sh
yarn install --immutable
yarn dev
```

El comando raíz inicia API y Web. Vite utiliza `http://localhost:5173` y la API
`http://localhost:3001` por defecto para convivir con el puerto `3000` publicado
por la Web de Docker. Vite exige el puerto `5173`; cierra otra instancia de
desarrollo de este proyecto si ya está ocupándolo. Para iniciar solo Web, incluso sin API:

```sh
yarn workspace @cecasem-conecta/web dev
```

La aplicación incluye el login, el cambio obligatorio de contraseña, la página
de administración `/users` y las rutas de trabajo del sistema.

## Autenticación — 1.2

React Hook Form, Zod y su resolver gestionan el formulario accesible de login.
Solo se normaliza el correo; la contraseña mantiene espacios y capitalización.
El backend aplica NFC de forma autoritativa. La contraseña se vacía al enviar y
no se conserva en la caché de mutaciones; la solicitud usa el cliente API central.

TanStack Query mantiene la identidad con key `['auth', 'me']`. El estado de carga
evita mostrar contenido protegido; un 401 de me representa sesión anónima y un
401 de login muestra rechazo genérico. Un 401 de un endpoint protegido futuro
invalida la identidad y elimina otras queries, notificando al layout existente.
No hay reintentos automáticos ni bucles de navegación.

Login correcto elimina cachés anteriores y actualiza la identidad; logout llama
al servidor, elimina cachés y vuelve a login. Un error de logout no confirma el
cierre. No se almacenan tokens, contraseñas ni session IDs en localStorage,
sessionStorage o un store global. Cookies viajan con credentials=include a través
del proxy del mismo origen; la UI no intenta leerlas. No se ofrece registro ni
recuperación pública por token.

## Usuarios y contraseñas — flujo vigente

En `/users`, el Administrador crea cada cuenta con una contraseña inicial. La
persona inicia sesión con ella y cambia su contraseña antes de continuar. El
formulario muestra los requisitos (8 caracteres, mayúscula, minúscula y símbolo)
y marca los que ya cumple. Restablecer contraseña permite asignar otra contraseña
inicial y obliga a cambiarla en el siguiente ingreso. El lápiz expande la
información del usuario; el formulario permite corregir nombres, apellidos y
correo, mientras el username se muestra como no editable. Las rutas/pantallas de
primer acceso y restablecimiento mediante token quedaron retiradas.

## Entorno y API

Los valores por defecto permiten arrancar sin crear archivos de entorno.
Si necesitas modificarlos, utiliza variables de proceso o un archivo local
`apps/web/.env`, siguiendo `.env.example`. Ese archivo real está ignorado por Git.

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api/v1` | Base pública de las solicitudes; Vite la incorpora al build. |
| `API_PROXY_TARGET` | `http://localhost:3001` | Destino del proxy de desarrollo; solo disponible en la configuración de Vite. |

El proxy conserva `/api` y el resto de la ruta al redirigir al backend. Si cambias
`APP_PORT` en la API, ajusta también `API_PROXY_TARGET`. Ejemplo en PowerShell
desde la raíz, sin crear archivos `.env`:

```powershell
$env:APP_PORT = '3100'
$env:API_PROXY_TARGET = 'http://localhost:3100'
yarn dev
```

Una comprobación técnica de integración es solicitar
`http://localhost:5173/api/v1/health`; debe devolver `{"status":"ok"}` cuando
la API esté disponible. La pantalla inicial no depende de esta solicitud.

`src/lib/api/client.ts` centraliza `fetch` para rutas relativas a la base,
acepta las opciones nativas (método, headers, body y señal de cancelación) y usa
`credentials: 'include'` para futuras sesiones con cookies HttpOnly. No crea
sesiones ni almacena tokens. No fuerza `Content-Type`, para permitir JSON con
header explícito y futuros formularios/multipart sin alterar su boundary.

El cliente devuelve JSON tipado o `undefined` para HTTP 204; el tipo genérico
expresa el contrato esperado, no valida contenido en tiempo de ejecución.
Cada consumidor añadirá la validación necesaria al existir su contrato.
`ApiError` contiene un mensaje en español y `status` (HTTP, o `null` para fallos
de red). Los cuerpos de error no se muestran ni registran. Las cancelaciones se
propagan. Las futuras features deberán presentar estos errores en su propia UI.

Nunca incluyas secretos en variables `VITE_`. El proxy se aplica al desarrollo.
El preview no requiere API para servir esta pantalla; en producción se prevé
un origen común mediante Nginx en una subfase posterior.

## Estructura y decisiones

- `src/app/providers`: `AppProviders` mantiene una instancia de QueryClient.
- `src/app/router`: rutas y página 404; `BrowserRouter` se monta desde `main.tsx`.
- `src/app/layout`: marco visual compartido y layouts no autenticado/autenticado.
  El layout autenticado queda reservado para Fase 1, sin montarse ni proteger rutas.
- `src/features/home`: pantalla inicial de esta subfase.
- `src/lib/api`: cliente HTTP y pruebas.
- `src/lib/query`: fábrica central de QueryClient; retries deshabilitados para
  consultas y mutaciones, manteniendo los demás defaults de TanStack Query.
- `src/test`: configuración DOM y limpieza de Testing Library.

Tailwind 4 utiliza `@tailwindcss/vite` y `@import "tailwindcss"`, siguiendo la
[integración oficial](https://tailwindcss.com/docs/installation/using-vite).
No requiere configuración de PostCSS ni archivos de configuración heredados.
El estilo es provisional, responsivo y basado en HTML semántico, con foco visible
y enlace para saltar al contenido.

React Hook Form y Zod pertenecen al stack previsto; se instalarán cuando haya
formularios o contratos que los necesiten. No se crean carpetas vacías para
features, componentes compartidos ni utilidades futuras.

## Scripts y validación

```sh
yarn lint
yarn typecheck
yarn test
yarn build
```

Estos comandos raíz validan API y Web. Los scripts de Web son:

| Script | Comando |
| --- | --- |
| `dev` | `vite` |
| `build` | `yarn typecheck && vite build` |
| `lint` | `eslint .` |
| `typecheck` | `tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `preview` | `vite preview` |

Las pruebas cubren pantalla inicial, ruta inexistente, regreso al inicio y
comportamiento HTTP: base configurable, credenciales, headers, errores HTTP/red,
respuesta 204, JSON inválido, cancelación y rechazo de URLs absolutas como ruta.

El build se genera en `apps/web/dist`, ignorado por Git. Para revisarlo:

```sh
yarn workspace @cecasem-conecta/web preview
```

Abre la URL impresa (por defecto `http://localhost:4173`), revisa `/`, una ruta
inexistente y el enlace de regreso, y detén el proceso con Ctrl+C al finalizar.
Vite preview es una herramienta de revisión local, no el servidor de producción.

## Primer acceso — 1.3 (flujo histórico retirado)

La descripción siguiente documenta la implementación anterior; sus rutas,
componentes y contratos ya no están activos.

/first-access es público bajo UnauthenticatedLayout. Lee #token= únicamente en
memoria y elimina inmediatamente el fragmento con history.replaceState, antes de
cualquier request de consumo. No consulta/valida automáticamente el token. Permite
pegarlo manualmente; una recarga puede exigir introducirlo otra vez.

RHF/Zod valida contraseña y confirmación por puntos de código después de NFC,
15–128, con espacios/Unicode. Ambos campos usan autocomplete=new-password.
La confirmación no se envía. Se impide doble submit y se limpian contraseñas al
enviar. No hay secretos en storage, navegación ni cachés de queries/mutations.
Tras éxito se elimina el token y se vuelve a /login con una confirmación no sensible.

useSession bloquea consumo ante sesión válida o fallo de comprobación. Muestra
identidad de la sesión abierta (no del token) y ofrece Cerrar sesión y continuar.
No cierra automáticamente; logout fallido mantiene el bloqueo. Logout correcto
limpia cachés privadas y conserva el token solo en memoria. Un 409 de consumo
provoca nueva consulta de sesión. Se distinguen errores de token, política y red.

No hay emisión administrativa frontend: se realiza mediante el endpoint mínimo
hasta 1.6. El restablecimiento es un flujo separado de 1.4; no hay correo automático.

## Restablecimiento — 1.4 (flujo histórico retirado)

La descripción siguiente documenta la implementación anterior; sus rutas,
componentes y contratos ya no están activos.

/reset-password es público bajo UnauthenticatedLayout. Usa #token= retirado
inmediatamente y entrada manual. CredentialPasswordForm comparte únicamente
formulario, política NFC, fragmento, detección de sesión y logout con primer acceso.
Endpoints, mensajes y éxito son específicos de cada flujo. No se duplica la política
ni se crea un framework general. No hay validación de token al cargar la pantalla.

Contraseña/confirmación usan autocomplete=new-password. La confirmación no sale
al backend; secretos no entran en storage ni caches de queries/mutations. Password
se limpia al enviar y token al completar. Errores diferenciados: token uniforme,
política, contraseña igual a actual, sesión abierta y red. Doble submit bloqueado.
Logout explícito conserva token solo en memoria; fallo mantiene bloqueo. Éxito
navega a /login con passwordResetCompleted=true, sin secreto ni login automático.
Un reload requiere pegar la credencial otra vez. El cliente solo admite mensajes
de validación conocidos de estos dos endpoints; no reenvía cuerpos arbitrarios.

No se añade botón administrativo, listado de usuarios/resets, correo ni cambio
personal de contraseña. Emitir/regenerar conserva contraseña y sesiones actuales;
consumir revoca todas las sesiones del destinatario y sustituye la contraseña.

## Capabilities y navegación — 1.5

El contrato Zod de identidad exige `permissions: string[]`, admite la lista vacía
y strings desconocidas para permitir la evolución del catálogo backend. El frontend
no replica el mapa institucional de roles. `features/auth/permissions.ts` consulta
únicamente las capabilities recibidas; el rol visible es información de identidad.

La configuración de navegación admite `requiredPermission` por item y filtra
usando la identidad actual de TanStack Query. El único item de producción es
Inicio (`/`), común a todos los usuarios autenticados, sin capability requerida.
Cerrar sesión sigue disponible para los cuatro roles. No se crean rutas ficticias
ni pantallas de administración. Los destinos restringidos de los tests son fixtures.

`me` mantiene `staleTime: 0`: al refrescar la consulta, la interfaz actualiza rol y
permissions sin relogin. Un 403 no cierra sesión ni borra la identidad; el backend
permanece autoritativo. Las pruebas verifican contrato, filtrado por capabilities,
navegación común, actualización de rol y conservación de sesión ante 403.

## Administración mínima — Subfase 1.6

`features/users` implementa `/users`: consulta activa para Directorio y acciones
individualmente autorizadas para Administrador. Formularios, buzones, credenciales
efímeras y limpieza de caché ante cambios propios se describen en
[Administración mínima](../../docs/subfase-1.6-administracion.md).
No se agregan dependencias ni se replica el mapa de roles backend.

## Organizaciones — Subfase 2.1

`features/directory` implementa navegación Directorio, listado paginado, fichas,
creación/edición, matriz/sedes, categorías e historial. Las capabilities de sesión
controlan los accesos. Un conflicto conserva el borrador y ofrece recargar con
advertencia; las queries se invalidan por identidad y se limpian al cerrar sesión.
Detalles en [Organizaciones](../../docs/subfase-2.1-organizaciones.md).
