# --- builder: install all deps (incl. dev) and compile TypeScript ---
FROM node:22-slim AS builder
WORKDIR /app

# better-sqlite3-multiple-ciphers tries a prebuilt binary first (prebuild-install) and only
# falls back to compiling — these are here as a safety net for when no prebuilt matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- prod-deps: a clean, dev-dependency-free node_modules for the runtime image ---
FROM node:22-slim AS prod-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev

# --- runtime: slim, no build toolchain ---
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# All three ship in the image — NODE_ENV (set at container-start, e.g. via
# `docker compose --env-file .env.dev up` / `.env.local`, not baked in beyond the default below)
# picks which one config.ts loads, so one image serves prod/dev/local via docker-compose.yml alone.
COPY --from=builder /app/env/.env.production ./env/.env.production
COPY --from=builder /app/env/.env.development ./env/.env.development
COPY --from=builder /app/env/.env.local ./env/.env.local
COPY package*.json ./

# SQLite file lives here — mount a volume onto this path to persist data across restarts.
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "dist/index.js"]
