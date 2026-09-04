# Math Animation Engine

An equation-to-animation studio that turns function, parametric, and implicit expressions into cinematic interactive graph scenes.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/math-animation-engine/src/App.tsx` — main studio shell, renderer, animation transport, presets, history, and exports.
- `artifacts/math-animation-engine/src/hooks/use-equation-validator.ts` — debounced client integration with the validation API.
- `artifacts/api-server/src/routes/validate.ts` — server-side math.js parser and structured validation response.
- `lib/api-spec/openapi.yaml` — source of truth for the `/api/validate` contract.
- `artifacts/math-animation-engine/src/index.css` — studio theme and responsive layout.

## Architecture decisions

- Validation is dual-layered: the client gives immediate request state while the API parses with math.js and returns normalized expressions, variables, errors, and suggestions.
- Equation history stays in localStorage so the studio is useful immediately without account or database setup.
- The graph evaluator supports time (`t`) and animation controls in the client; the renderer uses a 2D trace layer with an optional Three.js WebGL atmosphere.
- PNG and WebM are browser-native exports, avoiding a server render queue for the first release.

## Product

The studio accepts standard math or common LaTeX input, classifies expressions as function/parametric/implicit, animates time-aware traces, exposes timing and visual controls, stores recent cues, and exports frames or WebM captures.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The web build expects workflow-provided `PORT` and `BASE_PATH`; use the managed web workflow for preview.
- The Three.js layer must remain progressive enhancement because some preview browsers cannot create a WebGL context.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
