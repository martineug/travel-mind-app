# Quick Start (Docker — fastest way to run this)

A plain `docker compose up` runs in **local mode** — it auto-loads the root `.env`
(`NODE_ENV=local`), which picks `server/env/.env.local` inside the container. Both files are
**committed with obviously-fake placeholder secrets** (mocks are on for every vertical, so no
real Duffel account/key is ever needed in this mode) — there is nothing to configure, clone
and run:

```bash
git clone <this-repo>
cd <cloned-directory>
docker compose up --build
```

Then open **http://localhost** (not port 3000 — that's only the server container's internal
port, reverse-proxied by nginx).

**Requirements before running the command above:**
- Docker, with **Compose v2** (`docker compose`, not the standalone `docker-compose` binary).
- **[Ollama](https://ollama.com) running locally** with the configured model already pulled —
  Docker does not start or manage Ollama, and the server container reaches it on the host via
  `host.docker.internal`:
  ```bash
  brew install ollama          # or see ollama.com for other platforms
  ollama serve &
  ollama pull qwen3:8b         # must match OLLAMA_MODEL in server/env/.env.local
  ```

Two containers are started: `nginx` (serves the built Angular client and reverse-proxies
`/api/*` to the server) and `node` (the compiled Express server). **Ollama itself stays on
the host, not containerized** — Dockerizing it would mean losing Metal/GPU acceleration on
Mac and re-downloading a multi-GB model into an image.

**All three verticals run in mock mode** in local mode — `USE_MOCK_FLIGHTS`, `USE_MOCK_STAYS`,
and `USE_MOCK_CARS` are all `true` in `server/env/.env.local` (see
[Environment setup](README.md#environment-setup) in the main README), so flights, stays, and
cars all return type-accurate fixture data (`server/src/mocks/`) rather than calling the real
Duffel API.

**Other Docker modes** use real secrets and are reached explicitly — local is the default,
not these:

| Mode | Command | npm script | env-file (repo root) |
|---|---|---|---|
| Local (default, mocked) | `docker compose up --build` | `npm run docker:local` | `.env` |
| Dev | `docker compose --env-file .env.dev up --build` | `npm run docker:dev` | `.env.dev` |
| Prod | `docker compose --env-file .env.prod up --build` | `npm run docker:prod` | `.env.prod` |

`.env.dev`/`.env.prod` are **not committed** (unlike `.env`) — they hold a real
`DB_ENCRYPTION_KEY`/`JWT_SECRET` and, for dev, a real Duffel sandbox key. Create them yourself
(same shape as `.env`, see `docker-compose.yml`'s `environment:` block for the required keys)
if you need those modes.

Data persists in `server/data/<mode>/` on the host (bind-mounted into the container as
`/app/data`) — `local/`, `development/`, `production/`, and `e2e/` each get their own
subfolder, so switching modes never mixes databases and `docker compose down && docker compose
up` doesn't lose bookings/chats. Rebuild after a code change with `docker compose up --build`;
tear down with `docker compose down`. There's no named Docker volume in this setup
(`docker compose down -v` has nothing to remove) — delete the relevant `server/data/<mode>/`
directly for a clean slate.

> **Note:** the placeholder secrets committed for local mode are safe to publish (mocks are
> always on, so `DUFFEL_API_KEY` is never used, and `DB_ENCRYPTION_KEY`/`JWT_SECRET` only
> protect throwaway local data) — but never reuse them for a real deployment.

For running the app without Docker (active development, tests, etc.), see the
[main README](README.md#running-without-docker-manual-setup).
