# Engineering Decisions

## Node 20 LTS

The request specifies Node 20, and the current ESLint release requires at least Node 20.19 on that line. Homebrew's keg-only Node 20.20.2 is used through an explicit PATH, leaving the linked Node 25 installation unchanged. `.nvmrc` contains `20` for repeatability elsewhere.

This is an environment decision for the Lab, not a permanent policy for a future product.

## esbuild

esbuild supplies a small dependency surface, fast watch mode, an observable single-bundle build, and a deterministic `dist/` layout. A short checked-in build script copies static HTML/CSS and recreates generated output. Parcel and Vite were unnecessary for one TypeScript entry and no framework.

## Stable `@logseq/libs@0.0.17`

The npm `latest` tag and current official plugin samples point to 0.0.17 for the established plugin API, and its declarations contain the needed File Graph methods. The newer 0.3.4 line was not selected merely because npm audit proposes it: it requires separate compatibility proof. The known audit findings are accepted only as a Lab limitation, not a production approval.

## TypeScript 5.9.3

TypeScript 7.0.2 is current but incompatible with `typescript-eslint@8.64.0`'s declared peer range. The first clean install correctly failed rather than bypassing peer checks. TypeScript 5.9.3 is the conservative compatible stable selection.

## Separate source repository and local Graph fixture

The Lab lives under the outer development repository's `apps/` directory. The nested `logseq/` File Graph is ignored runtime data with its own preserved Git repository. Separating these boundaries prevents normal Graph auto-save activity from contaminating or blocking source commits. This is the authoritative layout for the Capability Lab; it does not decide future multi-package product organization.

## No UI framework

The interface is a single status panel with buttons, tables, logs, and JSON. Native DOM rendering keeps framework/runtime behavior out of the capability experiment and makes host/API failures easier to observe.

## No backend or cloud integration

All required experiments use the local Logseq plugin SDK. Login, external databases, LLM APIs, MCP, cloud services, and network backends would add unrelated failure and privacy surfaces.

## No DB Graph conversion

The existing Graph is a valuable File Graph and must not be migrated for a capability test. DB Graph differences are recorded as a risk and require a separate dedicated test environment.

## Safety-first write and cleanup model

Writes require an explicit panel action and can target only the configured experiment page. Created UUIDs are persisted privately. Deletion requires current registry membership, both visible ownership markers, and exact page resolution. The experiment page itself is retained for manual inspection. This is an experimental safety mechanism, not a complete production authorization model.

## Official events only

The Lab listens only to route, current-Graph, and DB change hooks exposed in SDK declarations. It does not invent a reliable editing-state hook or use DOM observers. Future UI refresh requirements must adapt to what manual testing confirms.
