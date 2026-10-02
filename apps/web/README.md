# CECASEM Conecta — Frontend

SPA React + TypeScript + Vite con autenticación mínima de Subfase 1.2.
Consulta la identidad actual antes de mostrar el área autenticada; no contiene
administración de usuarios ni funcionalidades de negocio posteriores.

## Desarrollo

Desde la raíz del monorepo, con Node 24.x y Yarn 4.18.1:

```sh
yarn install --immutable
yarn dev
```

El comando raíz inicia API y Web. Vite utiliza `http://localhost:5173` y la API
`http://localhost:3000` por defecto. Vite puede elegir otro puerto si está ocupado;
consulta la dirección impresa en consola. Para iniciar solo Web, incluso sin API:

```sh
yarn workspace @cecasem-conecta/web dev
```

Las rutas disponibles son `/login`, `/` autenticada y una página 404.
La pantalla inicial conserva su contenido temporal; no se añade dashboard.

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
del proxy del mismo origen; la UI no intenta leerlas. Los usuarios sin contraseña
esperan el primer acceso de 1.3; no se ofrecen registro ni recuperación pública.

## Entorno y API

Los valores por defecto permiten arrancar sin crear archivos de entorno.
Si necesitas modificarlos, utiliza variables de proceso o un archivo local
`apps/web/.env`, siguiendo `.env.example`. Ese archivo real está ignorado por Git.

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api/v1` | Base pública de las solicitudes; Vite la incorpora al build. |
| `API_PROXY_TARGET` | `http://localhost:3000` | Destino del proxy de desarrollo; solo disponible en la configuración de Vite. |

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

## Primer acceso — 1.3

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
hasta 1.6. No se añade recuperación, reset o correo automático.
