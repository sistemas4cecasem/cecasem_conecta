# CECASEM Conecta — Agent Instructions

## Project purpose

CECASEM Conecta is a web system for managing institutional relationships and cooperation activities inside CECASEM.

Its purpose is to centralize institutional knowledge about:

- organizations;
- people and their institutional roles;
- contact methods;
- outreach processes;
- emails sent and received;
- meetings;
- opportunities and applications;
- attachments;
- notifications;
- verification and audit history.

The system must allow one authorized CECASEM user to understand and continue work previously performed by another user without depending on personal memory, private inboxes, or spreadsheets.

---

## Working principle

Implement only the scope explicitly requested in the current task or development subphase.

Do not implement features from future phases unless they are strictly required by the current scope.

If a requested change conflicts with an existing architectural or business rule:

1. do not silently redesign the system;
2. explain the conflict;
3. propose the smallest valid solution;
4. wait for an explicit architectural decision when necessary.

Avoid speculative abstractions and unnecessary infrastructure.

---

## Architecture

CECASEM Conecta uses a **modular monolith**.

Do not introduce microservices unless the project architecture is explicitly changed.

Current technical direction:

- TypeScript
- Node.js LTS
- Yarn 4
- Yarn Workspaces
- React
- Vite
- NestJS
- PostgreSQL
- Prisma ORM
- Docker
- Docker Compose
- Nginx for production web serving/reverse proxy
- REST API
- TanStack Query
- React Hook Form
- Zod where appropriate on the frontend
- class-validator / class-transformer on the backend
- Tailwind CSS
- ExcelJS for spreadsheet import/export
- LibreTranslate as an optional translation provider

Do not introduce the following without explicit approval:

- microservices;
- Kubernetes;
- Kafka;
- RabbitMQ;
- Redis;
- Elasticsearch/OpenSearch;
- GraphQL;
- CQRS;
- Event Sourcing;
- external paid SaaS dependencies for core functionality.

---

## Repository structure

Expected structure:

```text
cecasem_conecta/
├── apps/
│   ├── api/
│   └── web/
├── packages/
├── infra/
├── docs/
├── AGENTS.md
├── package.json
├── yarn.lock
├── .yarnrc.yml
└── docker-compose.yml
```

### apps/api

NestJS backend.

### apps/web

React + Vite frontend.

### packages

Shared packages only when there is a demonstrated need.

Do not create shared packages prematurely.

### infra

Docker, Nginx, deployment scripts, and infrastructure configuration.

### docs

Local technical/project documentation when required.

---

## Package management

Yarn is the only package manager for this repository.

Use:

```bash
yarn
yarn add
yarn remove
yarn workspace
yarn workspaces
```

Do not use:

```bash
npm install
npm ci
pnpm
```

Do not generate:

- package-lock.json
- pnpm-lock.yaml

The repository must keep a single `yarn.lock`.

Yarn Workspaces manage the monorepo.

Use the `node-modules` linker unless the project explicitly changes this decision.

Expected `.yarnrc.yml` direction:

```yaml
nodeLinker: node-modules
```

---

## Backend conventions

The backend lives in `apps/api`.

Use NestJS as a modular monolith.

Expected high-level modules include:

- auth;
- users;
- directory;
- relationships;
- communications;
- opportunities;
- meetings;
- notifications;
- files;
- search;
- translation;
- audit;
- data-exchange;
- settings.

Do not treat every domain module as a separate service.

Prefer dependencies such as:

```text
Controller
    ↓
Application Service / Use Case
    ↓
Domain Rules / Policies
    ↓
Repository / Infrastructure
```

Controllers must not contain significant business logic.

Business rules must be enforced on the backend even when the frontend already restricts an action.

Avoid circular module dependencies.

Do not access another module's internal persistence implementation when a public application service can express the interaction.

---

## Frontend conventions

The frontend lives in `apps/web`.

Organize primarily by feature.

Preferred direction:

```text
src/
├── app/
├── features/
├── components/
└── lib/
```

Feature examples:

- auth;
- dashboard;
- organizations;
- people;
- contacts;
- relationships;
- opportunities;
- meetings;
- notifications;
- admin.

Use TanStack Query for server state.

Prefer local React state for local UI state.

Do not introduce Redux or another global state library without a demonstrated need.

Do not duplicate backend business rules as the only enforcement mechanism.

Frontend validation improves UX; backend validation remains authoritative.

---

## Authentication

Authentication uses email and password.

Passwords must never be stored in plaintext or with reversible encryption.

Use Argon2id or the approved password-hashing strategy.

The intended authentication model is:

- revocable server-side sessions;
- session token stored in an HttpOnly cookie;
- sessions persisted and controlled by the backend.

Do not implement JWT access/refresh token architecture unless this architectural decision is explicitly changed.

An administrator may initiate account creation or password reset, but must never know or retrieve the user's final password.

Temporary activation/reset credentials must be:

- time limited;
- single use;
- revocable.

---

## Authorization

Initial roles:

- Administrator
- Directorio
- Búsqueda
- Planificación

Authorization uses both:

- role-based permissions;
- contextual business rules.

Example:

A Búsqueda user may have general permission to close a relationship process, but only if that user is an actual participant in that process.

Directorio and Administrador may have explicit exceptions defined by business rules.

Never rely only on hidden/disabled frontend buttons for authorization.

---

## Core domain rules

### Historical actions

Historical communications and process actions must not be silently overwritten.

A sent/received communication is historical evidence.

Once consolidated:

- preserve the original body;
- preserve sender and recipients;
- preserve the user who registered it;
- preserve its event date and registration date.

Corrections must be represented as explicit, traceable corrections or invalidations.

### Editable master data

Organizations, people, roles, contact information and other master records may be corrected.

Relevant changes must preserve history:

- previous value;
- new value;
- user;
- timestamp.

### Imported data

Data imported from the historical Excel file is not automatically trusted.

Imported records must remain identifiable as imported and pending verification until explicitly verified.

Never invent missing historical information.

### Verification

Modification is not verification.

Creation is not verification.

Imported is not verification.

Personal information initially requires review after 6 months without verification.

Institutional information initially requires review after 12 months without verification.

These intervals are configurable.

### Duplicates

Exact contact information should be reused instead of duplicated where appropriate.

Similarity may produce duplicate candidates.

Never automatically merge organizations or people based solely on similarity.

Final duplicate consolidation requires an authorized human decision.

### Relationship processes

A relationship process represents one concrete institutional objective.

The same organization may have multiple processes over time or simultaneously when objectives differ.

Closing one process does not prohibit future processes.

Initial states:

- En preparación
- En curso
- Esperando respuesta
- En negociación
- Cerrado

A closed process requires a result.

Initial closure results:

- Concretado
- No aceptado
- Sin respuesta
- Desistido por CECASEM
- Otro

`Otro` requires an explanation.

A late response related to the same outreach may reopen the existing process.

A new objective should create a new process.

### Participants

A process participant is a user who:

- created the process;
- registered an outgoing communication;
- registered an incoming response;
- registered a meeting;
- performed another formal relationship action.

Adding only an internal note does not grant participant status for process closure.

### No-contact restrictions

An explicit request not to be contacted is different from:

- rejecting one proposal;
- not answering;
- discarding an opportunity.

Explicit no-contact restrictions must be prominently respected.

---

## Communications

CECASEM Conecta does not send email in the initial version.

Zoho/Gmail remain the sending and receiving channels.

The system manually records the institutional history.

Initial communication information may include:

- sender;
- To;
- CC;
- BCC;
- subject;
- original body;
- actual communication date;
- registration date;
- internal user who recorded it;
- CECASEM mailbox used;
- attachments.

Internal notes must always be visually and semantically distinguishable from external communications.

Do not claim automatic email synchronization or delivery verification.

---

## Files

Files must not be stored directly as general-purpose blobs in PostgreSQL.

PostgreSQL stores file metadata.

File bytes are stored through an abstracted file-storage service.

Initial implementation:

- private local filesystem / Docker volume.

Files must not be directly publicly accessible through predictable static URLs.

Download access must pass through authorization.

Initial maximum file size:

- 20 MB per file.

Do not automatically compress every file.

---

## Search

PostgreSQL is the search engine for the initial version.

Do not introduce Elasticsearch/OpenSearch.

Exact email lookup is a high-priority use case.

Searching an email should make it possible to determine:

- whether CECASEM previously contacted it;
- related person;
- related organization;
- date;
- internal user;
- process.

Approximate duplicate detection may use PostgreSQL capabilities such as `pg_trgm` when implemented.

---

## Translation

Translation is optional infrastructure.

The intended initial provider is a self-hosted LibreTranslate-compatible adapter.

Translation must:

- preserve the original content;
- be requested on demand;
- fail gracefully;
- never block the core relationship-management workflow.

Depend on an abstraction such as `TranslationProvider`, not directly on one provider throughout the codebase.

---

## Data deletion

Business history must not be physically deleted through ordinary application workflows.

Prefer states such as:

- inactive;
- archived;
- invalid;
- duplicate.

Historical references must remain intact.

---

## Deployment

Initial target:

- CECASEM local network.

Users will access the system from a browser through the server's LAN address.

The application must remain portable to the existing CECASEM VPS.

Do not hardcode:

- IP addresses;
- domains;
- ports;
- credentials;
- environment-specific URLs.

Use environment variables.

Docker Compose is the intended deployment unit.

Internet deployment requires HTTPS.

---

## Testing philosophy

Prioritize tests for business rules and critical flows.

Important backend test areas:

- authentication;
- authorization;
- process closure;
- participant rules;
- historical communication immutability;
- no-contact restrictions;
- verification;
- duplicate handling;
- import behavior.

Important integration/e2e flows:

1. login;
2. create organization/person/contact;
3. search previous contact;
4. create relationship process;
5. register outgoing email;
6. register response;
7. continue process as another user;
8. verify historical data remains intact;
9. close according to permissions;
10. derive an opportunity or meeting.

Do not pursue arbitrary coverage percentages at the expense of useful tests.

---

## Required validation

Before declaring a subphase complete, run the applicable commands.

Target root commands:

```bash
yarn lint
yarn typecheck
yarn test
yarn build
```

Also verify where applicable:

- database migrations;
- Docker build;
- Docker Compose startup;
- relevant manual functional flow;
- `git diff --check`;
- `git status --short`.

Do not claim a command passed if it was not actually executed.

If a command cannot run, report why.

---

## Git discipline

Keep changes scoped to the requested subphase.

Do not perform unrelated refactors.

Do not modify generated lockfiles manually.

Do not commit secrets.

Do not commit:

- `.env`;
- runtime uploads;
- database data;
- credentials;
- temporary build artifacts.

Do not revert unrelated existing user changes.

Before finishing, inspect the diff.

---

## Working with AI-generated changes

When implementing a task:

1. inspect the current repository first;
2. understand existing patterns;
3. change only what is necessary;
4. avoid speculative abstractions;
5. run validation;
6. review the diff;
7. report exactly what changed.

Do not assume missing functionality should be implemented just because it appears in future project documentation.

The current prompt/subphase defines the implementation boundary.

---

## Completion report

When finishing an implementation subphase, respond using a concise structure similar to:

```text
SUBFASE X.Y COMPLETADA

Implementado:
- ...

Validaciones:
- yarn lint: OK
- yarn typecheck: OK
- yarn test: OK
- yarn build: OK
- migraciones: OK
- git diff --check: OK

Regresiones:
- ninguna conocida

Pendientes:
- ...

Decisiones nuevas:
- ninguna / ...
```

Only report `OK` for validations actually executed successfully.

If something fails, report the failure instead of hiding it.

---

## Final rule

Prefer a simple, explicit and maintainable solution that satisfies the documented business rules.

Do not increase architectural complexity without solving a concrete CECASEM Conecta requirement.