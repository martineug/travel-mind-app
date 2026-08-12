import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db', async () => {
  const { createTestDb } = await import('../../test-utils/create-test-db');
  const testDb = createTestDb();
  return { getDb: () => testDb };
});

import { signUp, signIn, getUserFromToken, AuthError } from './auth-service';
import { getDb } from '../../db';

const testDb = getDb();

function randomEmail(): string {
  return `${Math.random().toString(36).slice(2)}@example.com`;
}

const TRAVELLER = { phoneNumber: '+353861234567', bornOn: '1990-01-01', gender: 'f', title: 'ms' };

describe('signUp', () => {
  it('creates a user plus a default trip and returns {user, token}', async () => {
    const email = randomEmail();

    const result = await signUp(email, 'password123', 'Ada', 'Lovelace', TRAVELLER);

    expect(result.user.emailAddress).toBe(email);
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(typeof result.token).toBe('string');

    const trips = testDb.prepare('SELECT trip_name FROM user_trips WHERE user_id = ?').all(result.user.userId) as { trip_name: string }[];
    expect(trips).toEqual([{ trip_name: 'My First Trip' }]);
  });

  it('throws a 409 AuthError when the email already exists', async () => {
    const email = randomEmail();
    await signUp(email, 'password123', 'Ada', 'Lovelace', TRAVELLER);

    await expect(signUp(email, 'different', 'Ada', 'Lovelace', TRAVELLER)).rejects.toThrow(AuthError);
  });
});

describe('signIn', () => {
  it('returns {user, token} on a correct password', async () => {
    const email = randomEmail();
    await signUp(email, 'password123', 'Ada', 'Lovelace', TRAVELLER);

    const result = await signIn(email, 'password123');

    expect(result.user.emailAddress).toBe(email);
    expect(typeof result.token).toBe('string');
  });

  it('throws a 401 AuthError on a wrong password', async () => {
    const email = randomEmail();
    await signUp(email, 'password123', 'Ada', 'Lovelace', TRAVELLER);

    await expect(signIn(email, 'wrong-password')).rejects.toThrow(AuthError);
  });

  it('throws a 401 AuthError for an unknown email', async () => {
    await expect(signIn(randomEmail(), 'password123')).rejects.toThrow(AuthError);
  });
});

describe('getUserFromToken', () => {
  it('resolves a valid token to the profile', async () => {
    const email = randomEmail();
    const { token, user } = await signUp(email, 'password123', 'Ada', 'Lovelace', TRAVELLER);

    const resolved = getUserFromToken(token);

    expect(resolved?.userId).toBe(user.userId);
  });

  it('returns null for a garbage token', () => {
    expect(getUserFromToken('not-a-real-token')).toBeNull();
  });

  it('returns null when the token\'s user no longer exists', async () => {
    const email = randomEmail();
    const { token, user } = await signUp(email, 'password123', 'Ada', 'Lovelace', TRAVELLER);
    testDb.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(user.userId);

    expect(getUserFromToken(token)).toBeNull();
  });
});
