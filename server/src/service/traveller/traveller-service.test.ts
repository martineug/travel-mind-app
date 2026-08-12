import { randomUUID } from 'crypto';
import { describe, it, expect, vi } from 'vitest';
import { UserProfile } from '../../model/user-profile';

vi.mock('../../db', async () => {
  const { createTestDb } = await import('../../test-utils/create-test-db');
  const testDb = createTestDb();
  return { getDb: () => testDb };
});

import { selfTraveller, listTravellers, saveTravellers } from './traveller-service';
import { getDb } from '../../db';

const testDb = getDb();

const PROFILE: UserProfile = {
  userId: 'placeholder', emailAddress: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace',
  passwordHash: 'hash', phoneNumber: '+353861234567', bornOn: '1990-01-01', gender: 'f', title: 'ms',
  currentTripId: null, currentSessionId: null, createdAt: '', updatedAt: '',
};

function insertProfile(userId: string): void {
  testDb.prepare(`
    INSERT INTO user_profiles (user_id, email_address, first_name, last_name, password_hash, phone_number, born_on, gender, title)
    VALUES (@userId, @emailAddress, @firstName, @lastName, @passwordHash, @phoneNumber, @bornOn, @gender, @title)
  `).run({ ...PROFILE, userId, emailAddress: `${userId}@example.com` });
}

describe('selfTraveller', () => {
  it('maps a UserProfile to the Traveller shape', () => {
    expect(selfTraveller(PROFILE)).toEqual({
      given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com',
      phone_number: '+353861234567', born_on: '1990-01-01', gender: 'f', title: 'ms',
    });
  });
});

describe('saveTravellers', () => {
  it('excludes a traveller matching the account holder (by name + DOB) from being persisted', () => {
    const userId = randomUUID();
    insertProfile(userId);
    const self = selfTraveller({ ...PROFILE, userId });

    saveTravellers(userId, [self]);

    expect(listTravellers(userId)).toEqual([]);
  });

  it('upserts non-account-holder travellers into TravellerProfileRepository', () => {
    const userId = randomUUID();
    insertProfile(userId);
    const guest = {
      given_name: 'Grace', family_name: 'Hopper', email: 'grace@example.com',
      phone_number: '+353861112222', born_on: '1985-05-05', gender: 'f' as const, title: 'ms' as const,
    };

    saveTravellers(userId, [guest]);

    const saved = listTravellers(userId);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ givenName: 'Grace', familyName: 'Hopper', email: 'grace@example.com' });
  });

  it('continues past one bad traveller rather than throwing', () => {
    const userId = randomUUID();
    insertProfile(userId);
    const bad = {
      given_name: 'Bad', family_name: 'Passenger', email: null as unknown as string,
      phone_number: '+353860000000', born_on: '1980-01-01', gender: 'f' as const, title: 'ms' as const,
    };
    const good = {
      given_name: 'Grace', family_name: 'Hopper', email: 'grace@example.com',
      phone_number: '+353861112222', born_on: '1985-05-05', gender: 'f' as const, title: 'ms' as const,
    };

    expect(() => saveTravellers(userId, [bad, good])).not.toThrow();

    const saved = listTravellers(userId);
    expect(saved.map(p => p.givenName)).toEqual(['Grace']);
  });

  it('listTravellers returns saved traveller profiles', () => {
    const userId = randomUUID();
    insertProfile(userId);
    saveTravellers(userId, [{
      given_name: 'Grace', family_name: 'Hopper', email: 'grace@example.com',
      phone_number: '+353861112222', born_on: '1985-05-05', gender: 'f', title: 'ms',
    }]);

    expect(listTravellers(userId)).toHaveLength(1);
  });
});
