import { randomUUID } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CarSearchParams, CarBookParams } from './car-types';

vi.mock('../../db', async () => {
  const { createTestDb } = await import('../../test-utils/create-test-db');
  const testDb = createTestDb();
  return { getDb: () => testDb };
});

const { mockProvider } = vi.hoisted(() => ({
  mockProvider: {
    search: vi.fn(),
    createQuote: vi.fn(),
    createBooking: vi.fn(),
  },
}));

vi.mock('../../providers/car-provider', () => ({
  createCarProvider: () => mockProvider,
}));

import { searchCars, bookCar } from './car-service';
import { CarBookingRepository } from '../../repositories/car-booking-repository';

const SEARCH_PARAMS: CarSearchParams = {
  pickup_latitude: 48.8566, pickup_longitude: 2.3522, dropoff_latitude: 48.8566, dropoff_longitude: 2.3522,
  pickup_date: '2026-09-10', pickup_time: '10:00', dropoff_date: '2026-09-12', dropoff_time: '10:00',
};

const SEARCH_RESPONSE = {
  pickup_date: '2026-09-10', dropoff_date: '2026-09-12',
  rates: [{
    id: 'rate_1', total_amount: '99.00', total_currency: 'EUR',
    supplier: { name: 'Hertz' },
    car: { name: 'VW Golf', category: 'compact', transmission: 'manual', max_passengers: 5 },
    pickup_location: { name: 'Paris CDG' },
    dropoff_location: { name: 'Paris CDG' },
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('searchCars', () => {
  it('builds the nested Duffel request shape from flat params', async () => {
    mockProvider.search.mockResolvedValue(SEARCH_RESPONSE);

    await searchCars({ ...SEARCH_PARAMS, driver_age: 25, residence_country_code: 'FR' });

    expect(mockProvider.search).toHaveBeenCalledWith({
      pickup_date: '2026-09-10', pickup_time: '10:00', dropoff_date: '2026-09-12', dropoff_time: '10:00',
      pickup_location: { geographic_coordinates: { latitude: 48.8566, longitude: 2.3522 } },
      dropoff_location: { geographic_coordinates: { latitude: 48.8566, longitude: 2.3522 } },
      driver: { age: 25, residence_country_code: 'FR' },
    });
  });

  it('defaults driver_age to 30 and residence_country_code to IE when omitted', async () => {
    mockProvider.search.mockResolvedValue(SEARCH_RESPONSE);

    await searchCars(SEARCH_PARAMS);

    expect(mockProvider.search).toHaveBeenCalledWith(expect.objectContaining({
      driver: { age: 30, residence_country_code: 'IE' },
    }));
  });
});

describe('bookCar', () => {
  it('runs the quote-then-booking flow and persists via CarBookingRepository', async () => {
    mockProvider.createQuote.mockResolvedValue({ id: 'quote_1', total_amount: '99.00', total_currency: 'EUR' });
    mockProvider.createBooking.mockResolvedValue({
      id: 'booking_1', reference: 'CARREF1', status: 'confirmed',
      supplier: { name: 'Hertz' }, car: { name: 'VW Golf' },
      pickup_date: '2026-09-10', dropoff_date: '2026-09-12',
    });
    const params: CarBookParams = {
      rate_id: 'rate_1', pickup_date: '2026-09-10', dropoff_date: '2026-09-12',
      given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com',
      phone_number: '+353861234567', date_of_birth: '1990-01-01',
    };
    const tripId = randomUUID();

    const result = await bookCar(params, tripId);

    expect(result).toMatchObject({ booking_reference: 'CARREF1', status: 'confirmed', supplier_name: 'Hertz', car_name: 'VW Golf', total: '99.00', currency: 'EUR' });
    const saved = new CarBookingRepository().findByTripId(tripId);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ reference: 'CARREF1', driver_given_name: 'Ada', driver_family_name: 'Lovelace' });
  });
});
