# CECASEM Conecta — Agent Instructions

## 1. Project purpose

CECASEM Conecta is a web system for managing institutional relationships and cooperation activities inside CECASEM.

Its purpose is to centralize institutional knowledge about:

- organizations;
- people and their institutional roles;
- contact methods;
- institutional outreach processes;
- emails sent and received;
- internal notes;
- meetings;
- opportunities and applications;
- attachments;
- notifications;
- verification history;
- audit history.

The system must allow one authorized CECASEM user to understand and continue work previously performed by another user without depending on:

- personal memory;
- private inboxes;
- isolated spreadsheets;
- informal conversations;
- knowledge held only by one employee.

The institutional history belongs to CECASEM, not only to the person who originally performed an action.

---

# 2. Source of truth

The project's functional and technical decisions are documented outside the repository in the CECASEM Conecta project documentation.

The current task or development subphase defines the immediate implementation scope.

Do not invent, replace or reinterpret documented business rules merely to simplify implementation.

If the repository, current prompt and documented architecture appear to contradict each other:

1. inspect the current implementation;
2. identify the contradiction explicitly;
3. do not silently redesign the system;
4. propose the smallest valid solution;
5. report the issue before making an architectural change when necessary.

---

# 3. Working principle

Implement only the scope explicitly requested in the current task or development subphase.

Do not implement functionality from future phases unless it is strictly necessary to complete the current scope.

Do not perform unrelated refactors.

Do not add infrastructure because it might be useful someday.

Prefer:

- simple solutions;
- explicit behavior;
- maintainable code;
- traceability;
- predictable structure.

Avoid:

- speculative abstractions;
- premature optimization;
- unnecessary dependencies;
- premature distributed architecture.

The current prompt defines the implementation boundary.

---

# 4. Development workflow

CECASEM Conecta is developed incrementally by phases and subphases.

The expected workflow is:

1. inspect the current repository;
2. understand the requested subphase;
3. identify the files and modules involved;
4. implement only that scope;
5. run applicable validations;
6. inspect the diff;
7. report what changed;
8. report any unresolved issue;
9. close the subphase only when its acceptance criteria are satisfied.

Do not start the next subphase automatically.

Do not implement future tasks "while already touching the same file" unless required by the current task.

---

# 5. Architecture

CECASEM Conecta uses a **modular monolith**.

Do not introduce microservices unless the architecture is explicitly changed.

Current technical direction:

- TypeScript;
- Node.js LTS;
- Yarn 4;
- Yarn Workspaces;
- React;
- Vite;
- NestJS;
- PostgreSQL;
- Prisma ORM;
- REST API;
- Docker;
- Docker Compose;
- Nginx;
- TanStack Query;
- React Hook Form;
- Zod where appropriate in the frontend;
- class-validator / class-transformer in the backend;
- Tailwind CSS;
- ExcelJS for spreadsheet import/export;
- LibreTranslate as an optional translation provider.

Do not introduce the following without explicit approval:

- microservices;
- Kubernetes;
- Kafka;
- RabbitMQ;
- Redis;
- Elasticsearch;
- OpenSearch;
- GraphQL;
- CQRS;
- Event Sourcing;
- external paid SaaS dependencies for essential functionality;
- automatic Gmail/Zoho synchronization;
- email sending from CECASEM Conecta;
- native mobile applications.

Architecture must solve current CECASEM requirements, not hypothetical future scale.

---

# 6. Repository structure

The expected monorepo structure is:

```text
cecasem_conecta/
├── AGENTS.md
├── .gitignore
├── .env.example
├── .yarnrc.yml
├── package.json
├── yarn.lock
├── docker-compose.yml
├── README.md
│
├── apps/
│   ├── api/
│   └── web/
│
├── packages/
│
├── infra/
│
├── docs/
│
└── storage/
```

## apps/api

NestJS backend application.

## apps/web

React + Vite frontend application.

## packages

Shared packages only when there is a demonstrated need.

Do not create shared packages prematurely.

A possible future package is:

```text
packages/contracts
```

but it must only be created if stable shared contracts justify it.

## infra

Infrastructure-related files such as:

- Nginx;
- Docker support;
- deployment scripts;
- infrastructure configuration.

## docs

Repository-local technical documentation when necessary.

## storage

Local runtime storage.

Runtime files inside this directory must not normally be committed.

---

# 7. AGENTS.md hierarchy

The repository uses hierarchical agent instructions.

Expected structure after Bootstrap Subphase 0.1:

```text
cecasem_conecta/
├── AGENTS.md
└── apps/
    ├── api/
    │   └── AGENTS.md
    └── web/
        └── AGENTS.md
```

## Root AGENTS.md

This file defines:

- project context;
- architecture;
- global constraints;
- Git discipline;
- security rules;
- business invariants;
- validation expectations;
- development workflow.

It applies to the entire repository.

## apps/api/AGENTS.md

This file will be created after the monorepo structure exists and has been validated.

It will contain backend-specific conventions such as:

- NestJS module structure;
- controllers;
- application services/use cases;
- policies;
- DTOs;
- validation;
- Prisma;
- migrations;
- authorization;
- tests;
- module dependencies.

It must complement this root file and must not contradict it.

## apps/web/AGENTS.md

This file will also be created after the monorepo structure exists and has been validated.

It will contain frontend-specific conventions such as:

- feature organization;
- React Router;
- TanStack Query;
- React Hook Form;
- Zod;
- reusable components;
- responsive behavior;
- loading/error/empty states;
- frontend testing.

It must complement this root file and must not contradict it.

## Important

All `AGENTS.md` files are intentional project documentation.

They must be committed to Git.

Never add:

```gitignore
AGENTS.md
**/AGENTS.md
```

to `.gitignore`.

Do not ignore all Markdown files.

---

# 8. Package management

Yarn is the only package manager for this repository.

Use Yarn 4 and Yarn Workspaces.

Allowed commands include:

```bash
yarn
yarn install
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

Do not generate or commit:

```text
package-lock.json
pnpm-lock.yaml
```

The repository must maintain a single:

```text
yarn.lock
```

The root `package.json` must declare the Yarn version using the `packageManager` field.

Example direction:

```json
{
  "packageManager": "yarn@4.x.x"
}
```

Do not manually edit `yarn.lock`.

---

# 9. Yarn linker

Use:

```yaml
nodeLinker: node-modules
```

in:

```text
.yarnrc.yml
```

The project intentionally prefers compatibility with:

- NestJS;
- Vite;
- Prisma;
- Docker;
- VS Code;
- ecosystem tooling.

Do not migrate to Yarn Plug'n'Play without an explicit architecture decision.

---

# 10. Gitignore policy

The repository must maintain a root `.gitignore`.

The purpose of `.gitignore` is to exclude:

- secrets;
- real environment files;
- local runtime files;
- dependencies;
- build output;
- caches;
- logs;
- generated temporary files;
- uploaded files;
- database runtime files.

It must not exclude important source-controlled project instructions.

The following must remain versioned:

- `AGENTS.md`;
- `apps/api/AGENTS.md`;
- `apps/web/AGENTS.md`;
- `.gitignore`;
- `.env.example`;
- application-specific `.env.example` files;
- `package.json`;
- `yarn.lock`;
- `.yarnrc.yml`;
- Prisma schema;
- Prisma migrations;
- Docker configuration without secrets;
- Nginx configuration without secrets;
- source code;
- tests;
- documentation.

Never add broad rules such as:

```gitignore
*.md
```

if they would exclude project documentation.

---

# 11. Environment variables and secrets

Real environment files must never be committed.

Ignore files such as:

```text
.env
.env.local
.env.development.local
.env.production
.env.production.local
apps/api/.env
apps/web/.env
apps/web/.env.local
```

Environment templates must remain versioned.

Examples:

```text
.env.example
apps/api/.env.example
apps/web/.env.example
```

Every required environment variable must be documented in an `.env.example` file using a safe placeholder value.

Never store real:

- passwords;
- database credentials;
- session secrets;
- private tokens;
- API keys;
- production credentials;
- certificates;
- private keys;

inside tracked files.

Do not commit secrets even temporarily.

---

# 12. Frontend environment variables

Vite variables prefixed with:

```text
VITE_
```

are exposed to browser code.

Therefore no secret may ever use the `VITE_` prefix.

Allowed public configuration may include values such as:

```text
VITE_API_URL=/api
```

Never expose values such as:

```text
VITE_DATABASE_PASSWORD
VITE_SESSION_SECRET
VITE_PRIVATE_KEY
VITE_INTERNAL_TOKEN
```

Frontend code must never require database credentials or backend secrets.

---

# 13. Backend conventions

The backend lives in:

```text
apps/api
```

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

Do not treat every module as an independent service.

Prefer a pragmatic separation similar to:

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

Business rules must be enforced by the backend.

Avoid circular module dependencies.

A module should interact with another module through its public application interface whenever possible.

Do not directly manipulate another module's internal persistence implementation merely for convenience.

Do not implement ceremonial architecture with unnecessary layers when a simpler structure preserves the required boundaries.

---

# 14. API conventions

The backend exposes a REST API.

Base path:

```text
/api/v1
```

Use:

- explicit DTOs;
- validation;
- predictable HTTP status codes;
- pagination for potentially large lists;
- query parameters for filters;
- consistent error responses;
- server-side authorization;
- opaque identifiers in URLs where appropriate.

Swagger/OpenAPI should be available in development.

Do not expose technical stack traces to normal clients.

---

# 15. Frontend conventions

The frontend lives in:

```text
apps/web
```

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

Feature-specific components should remain close to their feature.

Move components to shared directories only when they are genuinely reused.

Avoid global directories containing large unrelated collections of:

- services;
- hooks;
- components;
- helpers.

---

# 16. Frontend state management

Use TanStack Query for server state:

- queries;
- mutations;
- caching;
- invalidation;
- loading/error states;
- refresh behavior.

Use React local state for local UI concerns.

Use Context only when appropriate.

Do not introduce Redux or another global state library without a demonstrated need.

Do not duplicate server data into global frontend state without a concrete reason.

---

# 17. Forms

Use React Hook Form for significant forms.

Use Zod where frontend schema validation adds value.

Typical forms include:

- organizations;
- people;
- contact methods;
- processes;
- communications;
- opportunities;
- meetings.

Frontend validation improves user experience.

Backend validation remains authoritative.

Never rely on frontend validation for security or business-rule enforcement.

---

# 18. Authentication

Authentication uses:

- email;
- password;
- revocable server-side sessions;
- HttpOnly cookies.

Passwords must never be stored:

- in plaintext;
- with reversible encryption;
- in logs;
- in audit records.

Use Argon2id or the approved secure password hashing strategy.

The intended session model is:

1. user sends credentials;
2. backend verifies password;
3. backend creates revocable session;
4. browser receives a session token using an HttpOnly cookie;
5. backend validates session and user state on requests.

Do not implement JWT access/refresh architecture unless this architectural decision is explicitly changed.

---

# 19. Sessions

Sessions should support:

- secure random tokens;
- token hash storage;
- expiration;
- revocation;
- user association;
- session invalidation when required.

A deactivated user must not retain functional access through an old session.

A role change should take effect without requiring long-lived authorization claims to expire.

---

# 20. Account creation and password reset

An Administrator may:

- create users;
- initiate first access;
- initiate password reset.

An Administrator must never know or retrieve the user's final password.

Temporary credentials/tokens must be:

- random;
- time-limited;
- single-use;
- stored securely;
- invalidated after use.

---

# 21. Authorization

Initial roles:

- Administrator;
- Directorio;
- Búsqueda;
- Planificación.

Authorization uses:

- role-based access control;
- contextual business rules.

Example:

A user with role Búsqueda may have general permission to close relationship processes but may only close a process when that user is a valid participant.

Directorio and Administrador may have explicit exceptions defined by business rules.

Authorization must always be enforced by the backend.

Frontend visibility is only a user-interface convenience.

Never assume:

```text
button hidden = action protected
```

---

# 22. Core domain principles

The principal domain is institutional relationship management.

The central concept is the:

```text
Relationship Process
```

A relationship process represents one concrete institutional objective.

Organizations and people may participate in multiple processes over time.

The system must preserve institutional history between users.

---

# 23. Master data

Editable master data includes concepts such as:

- organizations;
- people;
- institutional links;
- positions;
- contact methods;
- categories.

Authorized users may correct this information.

Relevant changes must preserve history where required:

- previous value;
- new value;
- user;
- timestamp.

Editing master data is different from rewriting historical process events.

---

# 24. Historical actions

Historical communications and formal process actions must not be silently overwritten.

Once a communication is consolidated, preserve:

- original body;
- sender;
- recipients;
- CC;
- BCC;
- subject;
- actual event date;
- registration date;
- registering user;
- CECASEM mailbox used;
- attachments metadata.

Corrections must be implemented as:

- explicit corrections;
- supplementary observations;
- invalidations;
- traceable events.

Do not silently rewrite the original historical record.

---

# 25. Relationship processes

The same organization may have multiple processes:

- at different times;
- simultaneously when objectives differ.

Closing one process does not prohibit future processes.

Initial process states:

- En preparación;
- En curso;
- Esperando respuesta;
- En negociación;
- Cerrado.

A closed process requires a closure result.

Initial closure results:

- Concretado;
- No aceptado;
- Sin respuesta;
- Desistido por CECASEM;
- Otro.

If result is:

```text
Otro
```

an explanation is required.

A late response concerning the same outreach may reopen the existing process.

A genuinely different objective should create a new process.

---

# 26. Process participants

A user becomes a process participant through a formal action such as:

- creating the process;
- registering an outgoing communication;
- registering an incoming response;
- registering a meeting;
- performing another formal relationship action.

Adding only an internal note does not grant participant status for closure permissions.

Do not confuse:

```text
can read process
```

with:

```text
is process participant
```

---

# 27. Contact intentions

An intention represents planned institutional outreach before a formal interaction occurs.

An intention should preserve:

- author;
- purpose;
- target organization/person;
- creation date;
- activity;
- status.

An intention remains until it is:

- converted;
- cancelled;
- closed;

according to domain rules.

It should not disappear automatically merely because time passed.

---

# 28. Contact methods

A contact method is a domain entity, not merely a text field inside a person or organization.

Possible types include:

- email;
- phone;
- LinkedIn;
- official website;
- web form;
- other.

Contact methods may preserve:

- source;
- verification status;
- last verification date;
- active/inactive status;
- notes.

Exact contact information should be reused rather than duplicated unnecessarily.

---

# 29. Verification

Modification is not verification.

Creation is not verification.

Import is not verification.

Verification must be an explicit action.

Initial verification intervals:

- personal information: 6 months;
- institutional information: 12 months.

These values are configurable.

Do not hardcode assumptions that prevent future configuration.

---

# 30. Duplicate handling

Exact contact information should be reused when appropriate.

Similarity may produce duplicate candidates.

The system may suggest potential duplicates.

Never automatically merge organizations or people only because names are similar.

Final consolidation requires an authorized human decision.

A duplicate merge must preserve relevant historical relationships.

---

# 31. Imported data

The historical Excel file is an initial data source, not an authoritative source of truth.

Imported records must remain identifiable as:

- imported;
- pending verification where applicable.

Never invent missing information during import.

If historical records are incomplete, preserve them as incomplete rather than manufacturing values.

Importing does not mean verifying.

---

# 32. Communications

CECASEM Conecta does not initially send emails.

Zoho, Gmail or another approved provider remains the actual sending and receiving channel.

CECASEM Conecta manually records institutional communication history.

Communication information may include:

- sender;
- To;
- CC;
- BCC;
- subject;
- original body;
- actual date;
- registration date;
- registering user;
- CECASEM mailbox;
- attachments.

Do not claim:

- email delivery verification;
- automatic inbox synchronization;
- automatic sending;

unless such functionality is explicitly implemented in a future phase.

---

# 33. Internal notes

Internal notes are not external communications.

They must remain semantically and visually distinguishable.

Do not display an internal note in a way that could be interpreted as an email sent to the external actor.

Adding an internal note alone does not make a user a formal process participant.

---

# 34. No-contact restrictions

An explicit no-contact restriction must be respected.

It is different from:

- a rejected proposal;
- no response;
- a discarded opportunity;
- an inactive process.

The system should prominently warn users when an explicit restriction applies.

Removing/overriding such a restriction requires authorized action and auditability.

---

# 35. Opportunities

An opportunity may arise from:

- research;
- a communication;
- a process;
- a referral.

Possible opportunity data includes:

- title;
- organization;
- application link;
- deadline;
- requirements;
- source process;
- source communication;
- attachments.

Initial states:

- Pendiente de revisión;
- En preparación;
- Postulada;
- Descartada;
- Finalizada.

Discarding or deciding not to continue must preserve the reason where required.

An opportunity may involve multiple organizations.

Planificación receives particular visibility for opportunity workflows.

---

# 36. Meetings

Meetings may be linked to:

- relationship processes;
- opportunities.

Meeting information may include:

- date;
- time;
- timezone;
- participants;
- modality;
- platform;
- link/location;
- purpose;
- agreements;
- attendance;
- attachments.

Future meeting details may be updated.

Historical meeting outcomes must preserve traceability.

---

# 37. Files

Files must not normally be stored directly as database blobs.

PostgreSQL stores file metadata.

File bytes are stored through an abstracted storage service.

Initial implementation:

```text
private local filesystem / Docker volume
```

Files must not be served through publicly predictable static URLs.

Access should pass through backend authorization.

Initial maximum file size:

```text
20 MB
```

Do not automatically compress every uploaded file.

Preserve original files unless a later requirement explicitly defines transformation.

---

# 38. File storage abstraction

Storage should be implemented behind an abstraction conceptually similar to:

```text
FileStorage
```

Initial implementation may be:

```text
LocalFileStorage
```

Potential future implementations:

```text
MinioFileStorage
S3FileStorage
```

Do not implement future storage providers prematurely.

---

# 39. Translation

Translation is optional infrastructure.

The intended first provider is a self-hosted LibreTranslate-compatible service.

Backend code should depend on an abstraction conceptually similar to:

```text
TranslationProvider
```

Translation must:

- preserve original content;
- occur on demand;
- remain optional;
- fail gracefully;
- never block the primary workflow.

Do not spread provider-specific calls throughout domain/application code.

---

# 40. Search

PostgreSQL is the initial search engine.

Do not introduce Elasticsearch or OpenSearch.

High-priority search use cases include:

- organization;
- person;
- email;
- process.

Searching an email should make it possible to determine:

- whether CECASEM previously contacted it;
- related person;
- related organization;
- date;
- internal user;
- related process.

Approximate duplicate search may later use PostgreSQL features such as:

```text
pg_trgm
```

when required.

---

# 41. Notifications

Initial notifications are internal to CECASEM Conecta.

Do not introduce email notifications without explicit scope.

Notifications should focus on meaningful events.

Examples:

- new opportunity;
- meeting;
- discarded application;
- concreted process;
- reminder.

Avoid generating excessive low-value notifications.

---

# 42. Reminders

Initial inactivity reminder:

```text
7 days
```

This interval must remain configurable.

A reminder must not automatically change the business state of an intention or process.

The initial scheduler may run inside the NestJS application.

Do not introduce a queue or distributed scheduler unless scale requires it.

---

# 43. Data deletion

Business history must not be physically deleted through ordinary application workflows.

Prefer logical states such as:

- inactive;
- archived;
- invalid;
- duplicate.

Historical references must remain intact.

Physical deletion must not be added casually to CRUD interfaces.

---

# 44. Audit and history

Technical logs and business audit are different concepts.

Business-sensitive actions may require persisted audit records.

Examples:

- role change;
- user deactivation;
- password reset initiation;
- duplicate consolidation;
- exceptional close/reopen;
- no-contact restriction removal;
- imports.

Do not depend only on application logs for institutional auditability.

---

# 45. Logging

Logs may include:

- startup;
- shutdown;
- errors;
- technical failures;
- integration failures;
- relevant diagnostics.

Never log:

- passwords;
- raw session tokens;
- secrets;
- private keys;
- full uploaded files;
- complete email contents without an explicit controlled debugging requirement.

Avoid leaking sensitive information in error responses.

---

# 46. Database

Use PostgreSQL as the primary persistence layer.

Use one application database for the modular monolith.

Do not create a database per module.

Do not introduce distributed consistency mechanisms.

Use Prisma as the primary ORM.

Prisma is responsible for:

- schema;
- migrations;
- typed queries;
- transactions;
- indexes;
- constraints.

Prisma does not replace domain rules.

---

# 47. Prisma migrations

Prisma migrations are source-controlled artifacts.

Never add:

```text
prisma/migrations
```

to `.gitignore`.

If a task changes the Prisma schema and requires a migration:

1. create the migration;
2. inspect it;
3. include it in the diff;
4. validate it;
5. report it.

Do not modify production schema manually outside the migration strategy.

---

# 48. IDs and URLs

Use opaque identifiers where appropriate.

Do not expose sequential IDs as a business requirement.

The concrete identifier strategy may be UUID, CUID or another approved approach.

Do not hardcode assumptions about IDs into frontend behavior.

---

# 49. Docker

Docker and Docker Compose are the intended deployment mechanisms.

Expected services eventually include:

```text
web
api
db
translator
```

where the translator remains optional.

Use persistent volumes for:

- PostgreSQL;
- uploaded files;
- translation models/cache if required.

Do not commit Docker runtime data.

---

# 50. Deployment

Initial deployment target:

```text
CECASEM local network
```

Users access the system through a browser.

The system must remain portable to the CECASEM VPS.

Do not hardcode:

- IP addresses;
- domains;
- ports;
- credentials;
- production paths.

Use environment variables.

Internet deployment requires HTTPS.

LAN deployment does not remove the need for:

- authentication;
- authorization;
- input validation;
- file protection.

---

# 51. Runtime data

Do not commit:

- uploaded files;
- PostgreSQL runtime data;
- local database files;
- logs;
- temporary exports;
- generated backups;
- coverage reports;
- test reports;
- build output;
- caches.

If a runtime directory must exist in the repository, retain it using a safe placeholder such as:

```text
.gitkeep
```

while ignoring its runtime contents.

---

# 52. Testing philosophy

Prioritize tests that protect valuable business behavior.

Important backend areas include:

- authentication;
- sessions;
- authorization;
- process closure;
- participant rules;
- historical communication immutability;
- no-contact restrictions;
- verification;
- duplicates;
- import behavior.

Important integration/e2e flows include:

1. login;
2. create organization;
3. create person/contact;
4. search previous contact;
5. create relationship process;
6. register outgoing communication;
7. register incoming communication;
8. continue process as another user;
9. verify previous history remains intact;
10. close according to permissions;
11. derive opportunity;
12. register meeting.

Do not pursue arbitrary coverage percentages at the expense of useful tests.

---

# 53. Frontend testing

Prioritize testing for:

- critical forms;
- permissions reflected in UI;
- loading states;
- error states;
- empty states;
- process timeline;
- important interactions;
- high-value user flows.

Avoid excessive tests that only verify framework behavior.

---

# 54. Required validation

Before declaring a subphase complete, run the applicable project validations.

Target root commands:

```bash
yarn lint
yarn typecheck
yarn test
yarn build
```

Also verify when applicable:

- Prisma migrations;
- database connectivity;
- Docker build;
- Docker Compose startup;
- relevant manual functional flow;
- uploads;
- authorization;
- responsive behavior.

Do not claim a validation passed if it was not actually executed.

If a command cannot run, report:

- the command;
- the reason;
- whether it blocks the subphase.

---

# 55. Git discipline

Keep changes limited to the requested subphase.

Do not perform unrelated refactors.

Do not rewrite files only to change formatting unless required.

Do not revert unrelated user changes.

Do not manually edit generated lockfiles.

Do not commit secrets.

Before finishing a task, inspect:

```bash
git status --short
git diff --check
```

Also inspect the actual diff.

Verify that no unintended files are included.

---

# 56. Secret review before completion

Before reporting completion, verify that the diff does not contain:

- `.env` files;
- real passwords;
- database credentials;
- session secrets;
- private tokens;
- API keys;
- certificates;
- uploaded files;
- runtime database data;
- backup files.

If any secret is accidentally discovered in tracked changes:

1. stop;
2. remove it from the tracked content;
3. report the issue;
4. do not reproduce the secret unnecessarily in the response.

---

# 57. Dependency discipline

Do not add a dependency just because it simplifies a few lines of code.

Before adding a package, determine:

- what problem it solves;
- whether the platform already provides the capability;
- whether an existing dependency already covers the use case;
- whether the dependency introduces unnecessary operational complexity.

Do not introduce major architectural dependencies without explicit approval.

---

# 58. AI-generated changes

When implementing with an AI agent:

1. inspect the repository first;
2. understand existing conventions;
3. read applicable `AGENTS.md` files;
4. modify only necessary files;
5. run validation;
6. inspect the diff;
7. report exactly what changed.

Do not assume that missing future functionality should be implemented.

Do not generate entire unused architectures for future phases.

Prefer incremental code that serves the current subphase.

---

# 59. Code quality

Prefer:

- descriptive names;
- small focused functions;
- explicit types at module boundaries;
- clear error handling;
- simple control flow;
- business terminology consistent with the domain.

Avoid:

- generic names such as `data`, `manager`, `helper` when a more precise domain name exists;
- oversized services;
- duplicated business rules;
- large controllers;
- hidden side effects;
- premature abstraction;
- unnecessary inheritance.

---

# 60. Domain language

Use project terminology consistently.

Important terms include:

- Organization;
- Person;
- Contact Method;
- Relationship Process;
- Contact Intention;
- Communication;
- Internal Note;
- Opportunity;
- Meeting;
- Participant;
- Verification;
- No-contact Restriction;
- Audit Event.

Do not invent alternative names for the same concept without reason.

Naming in code may be English while user-facing text may be Spanish.

Be consistent within each layer.

---

# 61. User-facing language

The application is primarily intended for CECASEM staff.

Initial user-facing language is Spanish.

Avoid exposing internal technical terminology unnecessarily.

Errors shown to users should explain:

- what happened;
- what they can do next;

without exposing implementation details.

---

# 62. Error handling

Backend errors must follow a predictable format.

Distinguish between:

- validation errors;
- authentication errors;
- authorization errors;
- not-found errors;
- conflicts;
- business-rule violations;
- unexpected server failures.

Do not return raw exceptions to the frontend.

Frontend must provide useful error feedback.

---

# 63. Dates and timezones

Persist timestamps consistently.

Avoid using ambiguous local timestamps without context.

Meeting information may require an explicit timezone.

Actual communication date and system registration date are different concepts and must not be collapsed into one field.

---

# 64. Accessibility and responsive design

Frontend must remain usable on:

- desktop;
- laptop;
- tablet;
- mobile browser.

Prioritize semantic HTML and accessible controls.

Do not rely only on color to communicate important states.

Forms should provide visible validation messages.

Interactive elements should have usable target sizes.

---

# 65. Initial development priorities

The project prioritizes the following complete flow:

```text
login
→ institutional directory
→ search previous contact
→ contact intention
→ relationship process
→ communication
→ response
→ continuation by another user
→ opportunity / meeting
→ institutional visibility
```

A visually impressive dashboard must not take priority over this working flow.

---

# 66. Development phase discipline

Current development is organized into:

```text
FASE 0 — Bootstrap y base técnica
FASE 1 — Identidad, autenticación y autorización
FASE 2 — Directorio institucional
FASE 3 — Procesos y comunicaciones
FASE 4 — Archivos, oportunidades y reuniones
FASE 5 — Dashboard, búsqueda e intercambio
FASE 6 — Integración, QA y LAN
FASE 7 — Operación segura y VPS
FASE 8 — Evolución
```

Respect phase boundaries.

If the current task belongs to Fase 0, do not implement Fase 1 functionality unless strictly required for infrastructure.

---

# 67. Bootstrap-specific instruction

During Bootstrap Fase 0:

- establish repository structure;
- establish Yarn Workspaces;
- configure Git;
- configure `.gitignore`;
- configure safe environment templates;
- establish build/test/lint/typecheck commands;
- create the application shells;
- prepare Docker progressively.

Do not prematurely implement:

- authentication;
- organizations;
- communications;
- opportunities;
- meetings;
- domain workflows.

---

# 68. AGENTS creation timing

The root `AGENTS.md` exists from the beginning.

After Subphase 0.1 creates and validates:

```text
apps/api
apps/web
```

create:

```text
apps/api/AGENTS.md
apps/web/AGENTS.md
```

before significant backend/frontend implementation begins.

Do not create those files with speculative structure before the corresponding applications exist.

Their contents should reflect the real generated project structure.

---

# 69. Completion report

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

Only report `OK` for commands that were actually executed successfully.

If something failed, report it honestly.

If a validation does not apply yet, report:

```text
N/A
```

rather than pretending it passed.

---

# 70. Completion criteria

Do not declare a task complete only because code was written.

Completion requires, as applicable:

- requested behavior implemented;
- business rules preserved;
- authorization preserved;
- tests passing;
- lint passing;
- typecheck passing;
- build passing;
- migrations valid;
- Git diff reviewed;
- no secrets included;
- no unrelated changes introduced.

---

# 71. Final rule

Prefer the simplest explicit solution that satisfies CECASEM Conecta's documented requirements.

Protect:

- institutional history;
- authorization;
- traceability;
- data integrity;
- maintainability.

Do not increase architectural complexity without solving a concrete current requirement.