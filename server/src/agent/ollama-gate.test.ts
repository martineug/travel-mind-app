import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { runWithOllamaLimit as RunWithOllamaLimit, OllamaBusyError as OllamaBusyErrorType } from './ollama-gate';
import config from '../config';

function neverResolves<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

function tick(ms = 20): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ollama-gate.ts tracks running/queued counts in module-level state with no reset hook (by
// design — it's a process-wide gate, not meant to be reset in production). Each test gets a
// fresh module instance instead, so one test filling the gate's capacity can't leak into the next.
let runWithOllamaLimit: typeof RunWithOllamaLimit;
let OllamaBusyError: typeof OllamaBusyErrorType;

beforeEach(async () => {
  vi.resetModules();
  ({ runWithOllamaLimit, OllamaBusyError } = await import('./ollama-gate'));
});

describe('runWithOllamaLimit', () => {
  it('runs up to maxConcurrent immediately, queues the rest until a slot frees up', async () => {
    const { maxConcurrent } = config.ollama;
    const events: string[] = [];
    const gates: (() => void)[] = [];

    function makeTask(label: string) {
      return () => new Promise<void>(resolve => {
        events.push(`${label}-start`);
        gates.push(resolve);
      });
    }

    const runners = Array.from({ length: maxConcurrent + 1 }, (_, i) => runWithOllamaLimit(makeTask(`t${i}`)));

    // Only maxConcurrent tasks should have actually started — the extra one is queued.
    expect(events).toEqual(Array.from({ length: maxConcurrent }, (_, i) => `t${i}-start`));

    // Freeing one running slot should let the queued task start.
    gates[0]!();
    await tick();
    expect(events).toContain(`t${maxConcurrent}-start`);

    gates.forEach(release => release());
    await Promise.all(runners);
  });

  it('rejects with OllamaBusyError once maxConcurrent + maxQueueLength capacity is exceeded', async () => {
    const { maxConcurrent, maxQueueLength } = config.ollama;
    const capacity = maxConcurrent + maxQueueLength;

    // Fill every running + queued slot with tasks that never resolve.
    const pending = Array.from({ length: capacity }, () => runWithOllamaLimit(() => neverResolves()));
    void pending; // intentionally left unresolved — nothing needs to await these

    await expect(runWithOllamaLimit(() => Promise.resolve('x'))).rejects.toThrow(OllamaBusyError);
  });

  it('lets a fresh call through once running + queued both have room', async () => {
    const result = await runWithOllamaLimit(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });
});
