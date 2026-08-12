import dotenv from 'dotenv';
import path from 'path';

const envDir = path.resolve(__dirname, '..', 'env');
// Env-specific file loads first, base .env second — dotenv never overrides an already-set
// value, so precedence is: real env var (Docker/shell) > env-specific file > base .env. This
// lets Docker-injected values (e.g. CORS_ORIGIN) survive a same-named placeholder in the files.
dotenv.config({ path: path.join(envDir, `.env.${process.env.NODE_ENV || 'development'}`) });
dotenv.config({ path: path.join(envDir, '.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing requireEnvd environment variable: ${key}`);
  return value;
}

// One env-specific data root (./data/<env>) — DB_PATH and filesDir both derive from this
// single value rather than each other, so there's exactly one place per environment that
// says where its data lives, with no risk of the two drifting apart.
const dataDir = requireEnv('DATA_DIR');

const config = {
  NODE_ENV:          requireEnv('NODE_ENV'),
  LOG_LEVEL:         process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  PORT:              parseInt(requireEnv('PORT'), 10),
  CORS_ORIGIN:       requireEnv('CORS_ORIGIN'),
  DUFFEL_API_KEY: requireEnv('DUFFEL_API_KEY'),
  useMockStays:   process.env.USE_MOCK_STAYS   === 'true',
  useMockFlights: process.env.USE_MOCK_FLIGHTS === 'true',
  useMockCars:    process.env.USE_MOCK_CARS    === 'true',
  DB_PATH: path.join(dataDir, 'travel-mind.db'),
  filesDir: path.join(dataDir, 'files'),
  DB_ENCRYPTION_KEY: requireEnv('DB_ENCRYPTION_KEY'),
  JWT_SECRET: requireEnv('JWT_SECRET'),
  session: {
    idleTtlMs:       parseInt(process.env.SESSION_IDLE_TTL_MS ?? '1800000', 10),
    sweepIntervalMs: parseInt(process.env.SESSION_SWEEP_INTERVAL_MS ?? '300000', 10),
  },
  ollama: {
    host:           process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
    model:          requireEnv('OLLAMA_MODEL'),
    numCtx:         parseInt(requireEnv('OLLAMA_NUM_CTX'), 10),
    maxIterations:  parseInt(requireEnv('OLLAMA_MAX_ITERATIONS'), 10),
    enableThinking: requireEnv('OLLAMA_ENABLE_THINKING') === 'true',
    verbose:        requireEnv('OLLAMA_VERBOSE') === 'true',
    maxConcurrent:  parseInt(process.env.OLLAMA_MAX_CONCURRENT ?? '2', 10),
    maxQueueLength: parseInt(process.env.OLLAMA_MAX_QUEUE_LENGTH ?? '10', 10),
  },
};

export default config;
