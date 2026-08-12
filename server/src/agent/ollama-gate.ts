import config from '../config';

/** Thrown by runWithOllamaLimit when both the running slots and the wait queue are full —
 *  see that function's doc comment for why this exists. */
export class OllamaBusyError extends Error {
  constructor() {
    super('Too many requests are waiting on the assistant right now');
  }
}

let running = 0;
let queued = 0;

/** Caps how many ollama.chat() calls can be in flight at once — a single local Ollama instance
 *  (see agent.ts's shared `ollama` client) has no app-level concurrency control otherwise, so a
 *  burst of concurrent agent turns (e.g. the trip wizard firing 3 vertical kickoffs at once,
 */
export async function runWithOllamaLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= config.ollama.maxConcurrent) {
    if (queued >= config.ollama.maxQueueLength) {
      throw new OllamaBusyError();
    }
    queued++;
    try {
      await waitForSlot();
    } finally {
      queued--;
    }
  }

  running++;
  try {
    return await fn();
  } finally {
    running--;
    releaseWaiter();
  }
}

let waiters: (() => void)[] = [];

function waitForSlot(): Promise<void> {
  return new Promise(resolve => {
    waiters.push(resolve);
  });
}

function releaseWaiter(): void {
  const next = waiters.shift();
  if (next) next();
}
