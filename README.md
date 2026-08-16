# Travel Mind

A travel-booking single-page app: an Angular client talks to an Express/TypeScript server
that wraps a local Ollama LLM as a "concierge" agent for flights, stays, and cars (via
Duffel). The agent searches; booking is done from the client via a person picker — traveller
and payment data never pass through the model.

This is a three-package layout with no shared workspace tooling:

| Package | What it is |
|---|---|
| `client/` | Angular 21 SPA (standalone components, signals) |
| `server/` | Express + TypeScript API, SQLite (encrypted), Ollama agent |
| `e2e/` | Playwright end-to-end tests driving the real client against the real server |

Each has its own `package.json`/`node_modules` and must be `cd`'d into for most commands.

------------------------------------------------------------------------------------------
## Quick Start
------------------------------------------------------------------------------------------

The fastest way to run this app is via Docker — a single `docker compose up`, zero
configuration, fully mocked (all three verticals run against fixture data, no Duffel
account needed). See **[QUICKSTART.md](QUICKSTART.md)** for the full guide.

------------------------------------------------------------------------------------------------
## Running Without Docker (Manual Setup)
------------------------------------------------------------------------------------------------

Everything from here down is for running the app **directly with Node/npm instead of
Docker** — useful for active development (auto-reload, debugging, running tests), but not
needed just to evaluate the app. If Docker is all you need, stop here.

### Prerequisites

- **Node.js** ≥ 20 (developed against v24) and npm ≥ 11.
- **[Ollama](https://ollama.com)** installed and able to run locally, with the configured
  model pulled:
  ```bash
  brew install ollama          # or see ollama.com for other platforms
  ollama pull qwen3:8b         # must match OLLAMA_MODEL in server/env/.env.local
  ```
- A **Duffel API key** (a free [sandbox key](https://duffel.com) works) — only if you want
  `npm run dev` (real flight search) or the e2e/prod modes. Not required for `npm run
  dev:local`, which is fully mocked out of the box with zero setup.

### Install

```bash
git clone <this-repo>
cd <cloned-directory>
npm install --prefix client
npm install --prefix server
npm install --prefix e2e        # only needed if you'll run the e2e suite
```

### Environment setup

Server config lives in `server/env/`, one file per `NODE_ENV` plus a base file — `config.ts`
loads the active env-specific file first, then the base file second to fill in whatever's
still unset (see [How secrets/config layering works](#building) below). Every file needed
for local dev is committed with placeholder secrets; nothing to create yourself unless you
want real Duffel/prod access.

**`server/env/.env.local`** — fully self-contained (own placeholder secrets, mocks on for
every vertical). This is what `npm run dev:local` uses — zero setup required:
```
NODE_ENV=local
PORT=3000
CORS_ORIGIN=http://localhost:4200
OLLAMA_MODEL=qwen3:8b
OLLAMA_NUM_CTX=16384
OLLAMA_MAX_ITERATIONS=8
OLLAMA_ENABLE_THINKING=true
OLLAMA_VERBOSE=true
DATA_DIR=./data/local
USE_MOCK_STAYS=true
USE_MOCK_FLIGHTS=true
USE_MOCK_CARS=true
DB_ENCRYPTION_KEY=local-only-not-a-real-secret-safe-to-commit
JWT_SECRET=local-only-not-a-real-secret-safe-to-commit
DUFFEL_API_KEY=not_required_in_mock_mode
```

**`server/env/.env`** — base secrets shared by `development`/`e2e`/`production` (committed
with placeholders; fill in real values if you want `npm run dev`, e2e, or a real Duffel key):
```
DUFFEL_API_KEY=<your Duffel sandbox key>
DB_ENCRYPTION_KEY=<any strong random string>
JWT_SECRET=<any strong random string>
```

**`server/env/.env.development`** — used by `npm run dev` (`NODE_ENV=development`),
self-contained except the three secrets above:
```
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:4200
OLLAMA_MODEL=qwen3:8b
OLLAMA_NUM_CTX=16384
OLLAMA_MAX_ITERATIONS=8
OLLAMA_ENABLE_THINKING=true
OLLAMA_VERBOSE=true
DATA_DIR=./data/development
USE_MOCK_STAYS=false
USE_MOCK_FLIGHTS=true
USE_MOCK_CARS=true
```
Duffel gates Stays/Cars access separately from Flights, and a sandbox account may not have
either enabled — the `USE_MOCK_*` flags run those verticals against fixed fixture data
instead (`server/src/mocks/`). Flip a flag to `false` once real access lands.

Each env-specific file sets its own `DATA_DIR` (`./data/<env>`), which `DB_PATH` and the
file-storage folder both derive from (see `config.ts`) — so `local`/`development`/
`production`/`e2e` never share a database or file store.

An `.env.e2e` (same shape as `.env.development`, its own `DATA_DIR=./data/e2e`) is used
automatically when running the e2e suite — see [Running the E2E tests](#running-the-end-to-end-tests) below.

### Running in development

From the repo root:

```bash
npm run dev         # NODE_ENV=development — needs real secrets in server/env/.env (see above)
npm run dev:local    # NODE_ENV=local — fully mocked, zero setup
```

Both start everything (`ollama serve` + the API server with auto-reload + the Angular dev
server) concurrently. The app is served by Angular's dev server at **http://localhost:4200**
(it proxies `/api/*` to the Express server on :3000 — see `client/proxy.conf.json`), so open
that URL, not :3000 directly.

To run a piece on its own:
```bash
npm start --prefix client              # ng serve, :4200
npm run dev --prefix server            # ollama serve + nodemon, :3000 (development)
npm run dev:local --prefix server      # ollama serve + nodemon, :3000 (local/mocked)
```

## Running the tests

Requires the local npm installs from [Install](#install) above — these run against your
local `node_modules`, not inside Docker.

### Client unit tests (Vitest via Angular's builder)
```bash
cd client
npm test                                            # watch mode (default)
npx ng test --watch=false                           # single run, no watch
npx ng test --include=src/app/path/to/file.spec.ts  # one file
npx ng test --include="src/app/travel-booking/**/*.spec.ts"  # one folder (glob)
npx ng test --filter="<regex>"                      # filter by describe/it name
npx ng test --watch=false --filter="<regex>"        # combine: single run, filtered
```

### Server unit tests (Vitest)
```bash
cd server
npm test                                                # single run, all tests
npm run test:watch                                      # watch mode
npx vitest run src/service/trip/trip-service.test.ts    # one file
npx vitest run src/service                              # one folder
npx vitest run -t "<test name>"                         # filter by test name (any file)
npx vitest watch src/service/trip/trip-service.test.ts  # watch just one file
```

### End-to-end tests (Playwright)

Drives a real Chromium browser against the real client and server — auth, trip management,
and full search→book→itinerary flows for flights, stays, and cars.

```bash
npm run test:e2e   # from the repo root
```

This auto-starts both the client and server (server with `NODE_ENV=e2e`, pointed at an
isolated `server/data/e2e/` so your real dev database is never touched) and runs headless,
serially (`--workers=1` is baked into the `test` script — specs share one DB/backend and
Ollama, so parallel workers add contention rather than speed).

**Requirements:**
- **Ollama must already be running locally** with the model pulled (`ollama serve` +
  `ollama pull qwen3:8b`) — the trip wizard and chat search flows go through the real LLM
  tool-calling loop, not a mock. Duffel itself stays mocked (`USE_MOCK_*`), so results are
  deterministic once the agent decides to search.
- If `npm run dev` is already running from the root, **stop it first** — Playwright's
  `reuseExistingServer` option means it will otherwise attach to that already-running server
  (pointed at your real dev DB) instead of starting its own `e2e`-configured one.

Other useful invocations (run from `e2e/`):
```bash
npx playwright test                              # all specs, headless
npx playwright test --ui                         # interactive UI mode — step through, inspect, re-run
npx playwright test --headed                      # watch the real browser window while it runs
npx playwright test --debug                       # pause on the first action, step through with the inspector
npx playwright test tests/auth.spec.ts             # one spec file
npx playwright test tests/auth.spec.ts tests/trips.spec.ts  # a few spec files (no Ollama needed)
npx playwright test -g "wrong password"           # filter by test/describe name (grep)
npx playwright test --workers=1                   # force serial (already the default via `npm test` — set explicitly if you call playwright directly)
npx playwright test --last-failed                 # re-run only what failed last time
npx playwright show-report                        # open the last run's HTML report
npx playwright show-trace test-results/<failed-test>/trace.zip   # replay a failure's full trace
```

## Building

Manual, non-Docker build — `docker compose up --build` (see Docker, above) does this for you
inside the containers.

```bash
npm run build:client   # from the repo root (development config) — or: cd client && npm run build
npm run build:server   # from the repo root — or: cd server && npm run build
cd client && npm run build:production   # production-configuration client build
cd server && npm start                  # runs the compiled dist/index.js
```

**How secrets/config layering works:** `config.ts` loads the active `NODE_ENV`'s file first
(`server/env/.env.<NODE_ENV>`), then the base `server/env/.env` second — dotenv's default
behavior never overrides an already-set value, so precedence is: a real environment variable
(set by the shell, or injected by `docker-compose.yml`) > the env-specific file > the base
`.env`. That's what lets Docker's real `DB_ENCRYPTION_KEY`/`JWT_SECRET`/`DUFFEL_API_KEY`
(sourced from the root `.env`/`.env.dev`/`.env.prod` via `${VAR}` substitution in
`docker-compose.yml`) win over anything checked into the env-specific files, without those
files needing to conditionally omit values. `docker compose up` fails fast with a clear
message if the active env-file is missing a required secret.

## Type-checking (no separate lint config exists)

```bash
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit -p tsconfig.app.json
```

## Inspecting the database

```bash
cd server
npm run db:inspect                    # list all tables + row counts
npm run db:inspect -- <table> [limit] # dump rows from one table
```

## Performance monitoring

Every Ollama call (the main tool-calling loop, history summarization) and every tool call
(`flight_search`, `stay_search`, `car_search`, calculator, memory, file ops, etc.) is
recorded to a `call_metrics` table as it happens — duration, success/failure, token counts
and load/prompt-eval/eval timing (straight from Ollama's own response), and the request/
response payload (truncated to ~8,000 chars each). Recording is best-effort: a metrics-write
failure is logged and swallowed, never breaks a real chat/search. The table has no retention
policy yet, so it builds up indefinitely — see it for yourself any time with
`npm run db:inspect -- call_metrics [limit]`.

To turn that history into a report:

```bash
cd server
npm run report:performance                    # all-time, writes server/reports/performance-report.html
npm run report:performance -- --since=24h      # narrow the window (e.g. 30m, 24h, 7d)
npm run report:performance -- --out=custom.html  # write somewhere else (relative to server/reports/, or an absolute path)
```

Open the generated HTML file in a browser (it loads Chart.js from a CDN, so it needs
internet access to *view*, not to *generate*). It shows:
- Summary cards — total calls, success rate, avg/p95/max latency.
- **Calls-per-minute** and **average processing time per minute** charts.
- A breakdown table per call type/name/label (which agent or tool), including average
  prompt/completion tokens and tokens/sec for Ollama calls.
- Recent calls and recent failures, with the full (truncated) request/response payload
  available via an expandable `<details>` toggle per row.
