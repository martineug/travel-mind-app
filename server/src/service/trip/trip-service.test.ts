import { randomUUID } from 'crypto';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db', async () => {
  const { createTestDb } = await import('../../test-utils/create-test-db');
  const testDb = createTestDb();
  return { getDb: () => testDb };
});

import { TripService, TripError } from './trip-service';
import { getDb } from '../../db';

const testDb = getDb();

function insertProfile(userId: string): void {
  testDb.prepare(`
    INSERT INTO user_profiles (user_id, email_address, first_name, last_name, password_hash, phone_number, born_on, gender, title)
    VALUES (?, ?, 'Ada', 'Lovelace', 'hash', '+353861234567', '1990-01-01', 'f', 'ms')
  `).run(userId, `${userId}@example.com`);
}

function currentTripId(userId: string): string | null {
  const row = testDb.prepare('SELECT current_trip_id FROM user_profiles WHERE user_id = ?').get(userId) as { current_trip_id: string | null } | undefined;
  return row?.current_trip_id ?? null;
}

describe('TripService', () => {
  it('createTrip persists and returns the trip', () => {
    const userId = randomUUID();
    const service = new TripService(userId);

    const trip = service.createTrip('Paris Trip');

    expect(trip.tripName).toBe('Paris Trip');
    expect(service.getTrips()).toEqual([trip]);
  });

  it('getTrips returns all trips for the user', () => {
    const userId = randomUUID();
    const service = new TripService(userId);
    service.createTrip('Trip A');
    service.createTrip('Trip B');

    expect(service.getTrips().map(t => t.tripName)).toEqual(['Trip A', 'Trip B']);
  });

  it('renameTrip updates the name', () => {
    const userId = randomUUID();
    const service = new TripService(userId);
    const trip = service.createTrip('Old Name');

    const renamed = service.renameTrip(trip.id, 'New Name');

    expect(renamed?.tripName).toBe('New Name');
  });

  describe('deleteTrip', () => {
    it('throws a 404 TripError for an unknown trip', () => {
      const service = new TripService(randomUUID());
      expect(() => service.deleteTrip('nonexistent')).toThrow(TripError);
    });

    it('removes just the target trip when others remain', () => {
      const userId = randomUUID();
      const service = new TripService(userId);
      const tripA = service.createTrip('Trip A');
      service.createTrip('Trip B');

      const recreated = service.deleteTrip(tripA.id);

      expect(recreated).toBeNull();
      expect(service.getTrips().map(t => t.tripName)).toEqual(['Trip B']);
    });

    it('recreates a fresh default trip when deleting the last one', () => {
      const userId = randomUUID();
      const service = new TripService(userId);
      const trip = service.createTrip('Only Trip');

      const recreated = service.deleteTrip(trip.id);

      expect(recreated).not.toBeNull();
      expect(recreated?.tripName).toBe('My First Trip');
      expect(service.getTrips()).toEqual([recreated]);
    });
  });

  describe('switchTrip', () => {
    it('throws a 404 TripError for an unknown trip', () => {
      const service = new TripService(randomUUID());
      expect(() => service.switchTrip('nonexistent')).toThrow(TripError);
    });

    it('updates the profile\'s current trip on success', () => {
      const userId = randomUUID();
      insertProfile(userId);
      const service = new TripService(userId);
      const tripA = service.createTrip('Trip A');
      const tripB = service.createTrip('Trip B');
      service.switchTrip(tripA.id);

      service.switchTrip(tripB.id);

      expect(currentTripId(userId)).toBe(tripB.id);
    });
  });

  describe('getCurrentTripId', () => {
    it('returns the profile\'s stored id when set', () => {
      const userId = randomUUID();
      insertProfile(userId);
      const service = new TripService(userId);
      const trip = service.createTrip('Trip A');
      service.switchTrip(trip.id);

      expect(service.getCurrentTripId()).toBe(trip.id);
    });

    it('falls back to the first trip when the profile has none set', () => {
      const userId = randomUUID();
      insertProfile(userId);
      const service = new TripService(userId);
      const trip = service.createTrip('Trip A');

      expect(service.getCurrentTripId()).toBe(trip.id);
      expect(currentTripId(userId)).toBe(trip.id);
    });

    it('creates a default trip when the user has none at all', () => {
      const userId = randomUUID();
      insertProfile(userId);
      const service = new TripService(userId);

      const tripId = service.getCurrentTripId();

      expect(service.getTrips().map(t => t.id)).toEqual([tripId]);
    });
  });
});
