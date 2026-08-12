import { randomUUID } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StaySearchParams, StayBookParams } from './stay-types';

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

vi.mock('../../providers/stay-provider', () => ({
  createStaysProvider: () => mockProvider,
}));

import { searchStays, bookStay } from './stay-service';
import { StayBookingRepository } from '../../repositories/stay-booking-repository';

const SEARCH_PARAMS: StaySearchParams = {
  latitude: 48.8566, longitude: 2.3522, check_in_date: '2026-09-10', check_out_date: '2026-09-12',
};

function stayResult(overrides: { name: string; price: string; rating: number | null }) {
  return {
    id: `res_${overrides.name}`,
    accommodation: {
      name: overrides.name,
      rating: overrides.rating,
      review_score: 8.5,
      location: { address: { city_name: 'Paris', line_one: '1 Rue de Rivoli' } },
      photos: [],
      amenities: [],
      rooms: [{ rates: [{ id: `rate_${overrides.name}` }] }],
    },
    cheapest_rate_total_amount: overrides.price,
    cheapest_rate_currency: 'EUR',
    check_in_date: '2026-09-10',
    check_out_date: '2026-09-12',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('searchStays', () => {
  it('filters out results above max_price_per_night', async () => {
    mockProvider.search.mockResolvedValue({
      results: [stayResult({ name: 'Cheap', price: '50', rating: null }), stayResult({ name: 'Pricey', price: '500', rating: null })],
    });

    const results = await searchStays({ ...SEARCH_PARAMS, max_price_per_night: 100 });

    expect(results.map(r => r.name)).toEqual(['Cheap']);
  });

  it('filters out results below min_rating, keeping unrated results', async () => {
    mockProvider.search.mockResolvedValue({
      results: [
        stayResult({ name: 'LowRated', price: '100', rating: 2 }),
        stayResult({ name: 'HighRated', price: '100', rating: 4.5 }),
        stayResult({ name: 'Unrated', price: '100', rating: null }),
      ],
    });

    const results = await searchStays({ ...SEARCH_PARAMS, min_rating: 4 });

    expect(results.map(r => r.name).sort()).toEqual(['HighRated', 'Unrated']);
  });

  it('truncates to the top 10 results', async () => {
    mockProvider.search.mockResolvedValue({
      results: Array.from({ length: 15 }, (_, i) => stayResult({ name: `Hotel${i}`, price: '100', rating: null })),
    });

    const results = await searchStays(SEARCH_PARAMS);

    expect(results).toHaveLength(10);
  });
});

describe('bookStay', () => {
  it('runs the quote-then-booking flow and persists via StayBookingRepository', async () => {
    mockProvider.createQuote.mockResolvedValue({ id: 'quote_1', total_amount: '150.00', total_currency: 'EUR' });
    mockProvider.createBooking.mockResolvedValue({
      id: 'booking_1', reference: 'STAYREF1', status: 'confirmed',
      accommodation: { name: 'Hotel Ritz' }, check_in_date: '2026-09-10', check_out_date: '2026-09-12',
    });
    const params: StayBookParams = {
      rate_id: 'rate_1', check_in_date: '2026-09-10', check_out_date: '2026-09-12',
      guests: [{ given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com', phone_number: '+353861234567', born_on: '1990-01-01', gender: 'f', title: 'ms' }],
    };
    const tripId = randomUUID();

    const result = await bookStay(params, tripId);

    expect(result).toMatchObject({ booking_reference: 'STAYREF1', status: 'confirmed', accommodation_name: 'Hotel Ritz', total: '150.00', currency: 'EUR' });
    const saved = new StayBookingRepository().findByTripId(tripId);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ reference: 'STAYREF1', accommodation_name: 'Hotel Ritz' });
  });
});
