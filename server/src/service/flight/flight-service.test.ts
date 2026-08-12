import { randomUUID } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlightOrderData, Traveller } from './flight-types';

vi.mock('../../db', async () => {
  const { createTestDb } = await import('../../test-utils/create-test-db');
  const testDb = createTestDb();
  return { getDb: () => testDb };
});

const { mockProvider } = vi.hoisted(() => ({
  mockProvider: {
    searchFlights: vi.fn(),
    initiateFlightBooking: vi.fn(),
    confirmBooking: vi.fn(),
    suggestAirports: vi.fn(),
  },
}));

vi.mock('../../providers/flight-provider', () => ({
  createFlightProvider: () => mockProvider,
  isTravellerCountMismatch: (err: unknown) => !!err && typeof err === 'object' && (err as any).travellerCountMismatch === true,
}));

import { confirmBooking } from './flight-service';
import { FlightBookingRepository } from '../../repositories/flight-booking-repository';

const PASSENGERS: Traveller[] = [{
  given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com',
  phone_number: '+353861234567', born_on: '1990-01-01', gender: 'f', title: 'ms',
}];

const ORDER_DATA: FlightOrderData = {
  order_id: 'ord_1', booking_reference: 'ABC123', total_amount: '199.99', total_currency: 'EUR',
  documents: ['doc_1'], origin: 'DUB', destination: 'CDG', departure_date: '2026-09-10',
  airline: 'Aer Lingus', flight_number: 'EI600', dep: '10:00', arr: '12:00', dur: '2h 00m',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('confirmBooking', () => {
  it('persists the booking and returns the provider\'s order data on success', async () => {
    mockProvider.confirmBooking.mockResolvedValue(ORDER_DATA);
    const tripId = randomUUID();

    const result = await confirmBooking('offer_1', PASSENGERS, 'pi_1', tripId, 'chat_1', 'user_1');

    expect(result).toEqual({
      order_id: 'ord_1', booking_reference: 'ABC123', total: '199.99 EUR', documents: ['doc_1'],
    });
    const saved = new FlightBookingRepository().findByTripId(tripId);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ order_id: 'ord_1', origin: 'DUB', destination: 'CDG' });
  });

  it('translates a traveller-count-mismatch provider error into a 400 BookingError', async () => {
    const err = new Error('count mismatch') as Error & { travellerCountMismatch: true };
    err.travellerCountMismatch = true;
    mockProvider.confirmBooking.mockRejectedValue(err);

    await expect(confirmBooking('offer_1', PASSENGERS, 'pi_1', randomUUID(), 'chat_1', 'user_1'))
      .rejects.toMatchObject({ status: 400 });
  });

  it('translates a Duffel err.errors-shaped error into a 502 BookingError', async () => {
    const err = { errors: [{ title: 'Offer no longer available' }] };
    mockProvider.confirmBooking.mockRejectedValue(err);

    await expect(confirmBooking('offer_1', PASSENGERS, 'pi_1', randomUUID(), 'chat_1', 'user_1'))
      .rejects.toMatchObject({ status: 502, message: 'Offer no longer available' });
  });

  it('translates an unrecognized error into a 500 BookingError', async () => {
    mockProvider.confirmBooking.mockRejectedValue(new Error('boom'));

    await expect(confirmBooking('offer_1', PASSENGERS, 'pi_1', randomUUID(), 'chat_1', 'user_1'))
      .rejects.toMatchObject({ status: 500 });
  });
});
