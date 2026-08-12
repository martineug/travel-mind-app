import { describe, it, expect, vi } from 'vitest';
import { DuffelError } from '@duffel/api';
import { withDuffelRetry } from './duffel-retry';

function duffelError(status: number): InstanceType<typeof DuffelError> {
  return new DuffelError({ meta: { request_id: 'req_1', status }, errors: [], headers: {} as any });
}

describe('withDuffelRetry', () => {
  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withDuffelRetry(fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on a 429 and succeeds once the call recovers', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(duffelError(429))
      .mockResolvedValueOnce('ok');

    const result = await withDuffelRetry(fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on a 5xx server error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(duffelError(503))
      .mockResolvedValueOnce('ok');

    const result = await withDuffelRetry(fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on a plain network-level error (not a DuffelError)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce('ok');

    const result = await withDuffelRetry(fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('fails fast on a non-retryable DuffelError (e.g. 422 validation) without retrying', async () => {
    const err = duffelError(422);
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withDuffelRetry(fn)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after exhausting retries on a persistently retryable failure', async () => {
    const err = duffelError(429);
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withDuffelRetry(fn)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3); // MAX_ATTEMPTS
  });
});
