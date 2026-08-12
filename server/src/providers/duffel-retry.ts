import { DuffelError } from '@duffel/api';
import { createLogger } from '../logger';

const logger = createLogger('duffel-retry');

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 300;

function isRetryable(err: unknown): boolean {
  if (err instanceof DuffelError) {
    const status = err.meta?.status;
    // A rate limit or a Duffel-side server error is worth another try; anything else (bad
    // request, auth, validation, "offer no longer available", etc.) will just fail again.
    return status === 429 || status >= 500;
  }
  // Not a DuffelError at all — a network-level failure (timeout, DNS, connection reset) from
  // the underlying fetch, which is safe to retry for the read-only calls this wraps.
  return true;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Retries a read/search/quote call to Duffel on transient failures (429 rate limits, 5xx, or a
 *  network-level error) with short exponential backoff, capped at MAX_ATTEMPTS. Deliberately not
 *  used for booking/payment-creating */
export async function withDuffelRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= MAX_ATTEMPTS || !isRetryable(err)) {
        throw err;
      }

      const backoffMs = BASE_DELAY_MS * 2 ** (attempt - 1);
      logger.error({ attempt, backoffMs, err }, 'Duffel call failed — retrying');
      await delay(backoffMs);
    }
  }
}
