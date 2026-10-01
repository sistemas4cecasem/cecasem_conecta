# CECASEM Conecta — Frontend Agent Instructions

## Scope and current state

These instructions apply to everything under `apps/web` and complement the
[root AGENTS.md](../../AGENTS.md). Higher-level documented architecture,
functional and business decisions remain authoritative; do not override them here.

At Subphase 0.1.1, this workspace contains only its package manifest and these
instructions. React/Vite has not been initialized. The conventions below describe
future work when the corresponding subphase authorizes it; they do not authorize
creating application code, installing dependencies or advancing future phases.

## Approved frontend stack

Use React, TypeScript, Vite, React Router, TanStack Query, React Hook Form, Zod,
Tailwind CSS, Vitest and Testing Library. Add dependencies through Yarn only when
required by the current scope, following the root dependency discipline.

## Feature organization

When initialized, the intended direction is the following; these directories and
source files do not exist yet:

```text
src/
├── app/
│   ├── router/
│   ├── providers/
│   └── layout/
├── features/
├── components/
│   └── shared/
├── lib/
│   ├── api/
│   ├── query/
│   └── utils/
└── main.tsx
```

- Organize primarily by feature. Keep feature-specific components, hooks and
  types near the functionality they serve.
- Move components into `components/shared` only after actual reuse is demonstrated.
- Avoid global `components`, `services` or `utils` folders containing large
  collections of unrelated code. Do not create shared abstractions speculatively.

## State and API access

- TanStack Query owns server queries, mutations, cache, invalidation and related
  loading/error states. Avoid copying server data into another global store.
- Prefer `useState` or `useReducer` for local UI state, and Context where it makes
  sense. Redux, Zustand or another global state manager requires a concrete need
  and explicit approval.
- Route HTTP access through a central API client; do not scatter arbitrary
  `fetch` or HTTP client calls among components. Features may encapsulate their
  own queries and mutations around that client.
- Configure the backend URL through the environment. Do not hardcode it or expose
  backend secrets in browser configuration; follow the root rules for `VITE_`.
- Convert server errors into useful UI states while preserving relevant, safe
  diagnostics for development. Concrete API integration belongs to Subphase 0.3.

## Forms and components

- Use React Hook Form for nontrivial forms and Zod when typed, structured
  validation adds value. Avoid manually duplicating state managed by the library.
- Frontend validation improves UX; backend validation remains authoritative.
  Show actionable errors near the relevant field or action.
- Prefer small components with clear responsibilities. Avoid mixing extensive
  data loading, business decisions, layout and forms in one component.
- Extract presentational components when they reduce complexity; do not split
  single-use markup into components without improving clarity.
- Use explicit types for public component props.

## Permissions and UI states

- Hiding or disabling an action according to permissions improves UX; it is not
  security authorization. Never make the UI the sole source of complex contextual
  rules. The server remains authoritative.
- Handle `401` and `403` coherently when authentication is implemented.
- For data-dependent features, account for loading, error, empty, success and
  disabled/pending states as applicable. Do not support only the success path.

## Responsive design and accessibility

- Keep layouts usable on desktop, laptop, tablet and mobile; avoid unnecessary
  fixed widths.
- Use semantic HTML and buttons instead of recreating controls with `div`.
- Support keyboard navigation in relevant controls, associate labels with form
  inputs and provide usable interactive target sizes.
- Do not communicate states only through color. Follow the root conventions for
  Spanish user-facing text and helpful error feedback.

## TypeScript and contracts

- Avoid `any` except with exceptional justification. Do not hide errors through
  indiscriminate casts.
- Model states so impossible combinations cannot occur when reasonably practical.
- Keep local types local. Move stable, truly shared contracts into `packages/`
  only after a demonstrated need; do not create a shared package in advance.
- Do not automatically duplicate complete backend models in the frontend.

## Tests

- Use Vitest and Testing Library to test user-observable behavior rather than
  internal implementation details.
- Prioritize forms, critical interactions and flows. Cover loading, error and
  empty states where relevant.
- Test how permissions affect the UI while recognizing that backend tests enforce
  actual security. Add regression tests for important bugs when reasonable.

## Closing frontend tasks

Review the actual diff and `git status --short`; run `git diff --check` and the
applicable root `yarn lint`, `yarn typecheck`, `yarn test` and `yarn build` commands.
Report failures and commands that could not run. Never claim unexecuted tests or
bootstrap orchestration with absent child scripts as real application validation.
