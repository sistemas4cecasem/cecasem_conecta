# CECASEM Conecta — Backend Agent Instructions

## Scope and current state

These instructions apply to everything under `apps/api` and complement the
[root AGENTS.md](../../AGENTS.md). Higher-level documented architecture, business
and security decisions remain authoritative; do not override them here.

At Subphase 0.1.1, this workspace contains only its package manifest and these
instructions. NestJS has not been initialized. The conventions below describe
future work when the corresponding subphase authorizes it; they do not authorize
creating application code, installing dependencies or advancing future phases.

## Approved backend stack

Use NestJS, TypeScript, REST JSON under `/api/v1`, Prisma ORM, PostgreSQL,
`class-validator`, `class-transformer`, Swagger/OpenAPI, Jest and Supertest.
Document HTTP contracts with Swagger/OpenAPI in development when implemented.

## Modular organization

The backend will be a modular monolith. When initialized, the intended direction
is the following; these directories do not exist yet:

```text
src/
├── common/
├── config/
├── database/
└── modules/
```

- Organize modules around business capabilities, not one module per database table.
- Keep modules in the same application; do not introduce microservices or
  distributed communication between modules.
- Each module owns its rules and persistence. Use the owning module's public
  application services/use cases instead of modifying its data through internal
  repositories from another module.
- Avoid circular dependencies. Introduce shared code only after a demonstrated need.

## Responsibilities

Follow the pragmatic direction already established in the root:

```text
Controller → Application Service / Use Case → Domain Rules / Policies → Repository / Infrastructure
```

- Controllers handle HTTP, DTOs and response status codes; keep significant
  business logic out of them.
- Application services/use cases coordinate operations. Domain rules/policies
  protect invariants and contextual decisions.
- Infrastructure contains Prisma access and external adapters.
- Introduce a layer or class only when it adds value; do not impose a full Clean
  Architecture implementation or ceremonial wrappers.

## DTOs and validation

- External requests use explicit DTOs validated with `class-validator` and
  transformed with `class-transformer` where appropriate.
- Backend validation is authoritative, even for data already validated by the UI.
- Prefer focused DTOs over generic oversized objects. Separate input and output
  DTOs when that clarifies the contract.
- Do not expose Prisma models directly as HTTP contracts for convenience.

## Persistence and migrations

These rules apply once Prisma and PostgreSQL are introduced in their subphase:

- Treat Prisma as persistence infrastructure, not a substitute for domain rules.
- Keep `schema.prisma` and migrations traceable and versioned. Include, inspect
  and validate a migration whenever a persistent schema change requires one.
- Do not edit applied migrations to conceal changes or use `db push` as a
  permanent substitute for the project's migration strategy.
- Review constraints and indexes for invariants that can also be protected by
  PostgreSQL. Use transactions when a business operation requires atomicity.
- Never manually alter historical data to evade business rules.
- Do not delete data or rebuild the schema merely to make local development pass.
- Changes to production schema or manual data transformations require an explicit
  decision; they are not implicit permission granted by a migration task.

## Authorization, security and errors

- Enforce authorization on the server. Guards/decorators may check general
  permissions; policies/use cases enforce contextual business rules.
- A frontend restriction never replaces a backend permission check.
- Do not log secrets, passwords, tokens or unnecessary sensitive request bodies.
- Distinguish expected business errors from internal failures. Translate them at
  the HTTP boundary into consistent responses; do not throw arbitrary HTTP
  exceptions throughout the domain.
- Do not hide relevant failures. Preserve safe diagnostics without exposing
  sensitive internals, raw exceptions or stack traces in production responses.
- Concrete error handling will be established in Subphase 0.2.

## Tests and dependencies

- Use Jest unit tests for meaningful rules and use cases, integration tests when
  PostgreSQL/Prisma participates, and Supertest for API/e2e behavior.
- Prioritize authorization and critical rules identified in the root instructions.
  Important bug fixes should include regression tests when reasonable.
- Avoid tests that merely restate trivial implementations or target artificial
  coverage percentages.
- Install only dependencies needed by the current scope using
  `yarn workspace @cecasem-conecta/api add`. Check whether NestJS, Node or the
  existing stack already solves the problem before adding a library.
- Do not introduce infrastructure intended only for future phases.

## Closing backend tasks

Review the actual diff and `git status --short`; run `git diff --check` and the
applicable root `yarn lint`, `yarn typecheck`, `yarn test` and `yarn build` commands.
Validate required migrations when they exist. Report failures and commands that
could not run. Never report an unexecuted check as successful, or bootstrap
orchestration with absent child scripts as real application validation.
