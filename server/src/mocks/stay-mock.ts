import {
  StaysAccommodation,
  StaysAmenity,
  StaysBooking,
  StaysQuote,
  StaysRoom,
  StaysRoomRate,
  StaysSearchResponse,
  StaysSearchResult,
  Guest,
} from '@duffel/api/dist/Stays/StaysTypes';
import { StaysBookingPayload } from '@duffel/api/dist/Stays/Bookings/Bookings';
import type { StaysProvider, StaysSearchParams } from '../providers/stay-provider';

interface MockOverrides {
  name: string;
  rating: number | null;
  review_score: number | null;
  city_name: string;
  line_one: string;
  photo: string;
  amenityTypes: StaysAmenity['type'][];
  price: string;
  currency: string;
}

const FIXTURES: MockOverrides[] = [
  { name: 'The Riverside Grand',        rating: 5, review_score: 9.2, city_name: 'City Centre',  line_one: '12 Riverside Walk',     photo: 'https://picsum.photos/seed/stay1/400/300',  amenityTypes: ['wifi', 'pool', 'spa', 'concierge'],   price: '289.00', currency: 'EUR' },
  { name: 'Harbour View Hotel',         rating: 4, review_score: 8.6, city_name: 'Harbourside',  line_one: '4 Quay Street',         photo: 'https://picsum.photos/seed/stay2/400/300',  amenityTypes: ['wifi', 'gym', 'restaurant'],          price: '174.50', currency: 'EUR' },
  { name: 'The Old Town Inn',           rating: 3, review_score: 7.9, city_name: 'Old Town',     line_one: '21 Market Square',      photo: 'https://picsum.photos/seed/stay3/400/300',  amenityTypes: ['wifi', 'laundry'],                    price: '98.00',  currency: 'EUR' },
  { name: 'Skyline Suites',             rating: 5, review_score: 9.0, city_name: 'Financial District', line_one: '88 Tower Road',  photo: 'https://picsum.photos/seed/stay4/400/300',  amenityTypes: ['wifi', 'gym', 'pool', 'business_centre'], price: '342.00', currency: 'EUR' },
  { name: 'Garden Boutique Hotel',      rating: 4, review_score: 8.8, city_name: 'West End',     line_one: '7 Linden Avenue',       photo: 'https://picsum.photos/seed/stay5/400/300',  amenityTypes: ['wifi', 'restaurant', 'concierge'],    price: '215.00', currency: 'EUR' },
  { name: 'Central Station Lodge',      rating: 3, review_score: 7.4, city_name: 'City Centre',  line_one: '3 Platform Lane',       photo: 'https://picsum.photos/seed/stay6/400/300',  amenityTypes: ['wifi', '24_hour_front_desk'],         price: '112.00', currency: 'EUR' },
  { name: 'The Merchant House',         rating: 4, review_score: 8.3, city_name: 'Old Town',     line_one: '15 Guild Street',       photo: 'https://picsum.photos/seed/stay7/400/300',  amenityTypes: ['wifi', 'restaurant', 'room_service'], price: '189.00', currency: 'EUR' },
  { name: 'Parkside Apartments',        rating: 4, review_score: 8.5, city_name: 'Parkside',     line_one: '9 Greenfield Road',     photo: 'https://picsum.photos/seed/stay8/400/300',  amenityTypes: ['wifi', 'parking', 'laundry'],         price: '156.00', currency: 'EUR' },
  { name: 'The Royal Crescent',         rating: 5, review_score: 9.4, city_name: 'City Centre',  line_one: '1 Crescent Terrace',    photo: 'https://picsum.photos/seed/stay9/400/300',  amenityTypes: ['wifi', 'spa', 'restaurant', 'concierge'], price: '410.00', currency: 'EUR' },
  { name: 'Budget Traveller Hostel',    rating: 2, review_score: 6.8, city_name: 'University Quarter', line_one: '30 Campus Way',  photo: 'https://picsum.photos/seed/stay10/400/300', amenityTypes: ['wifi'],                              price: '54.00',  currency: 'EUR' },
];

function buildMockRate(idx: number, overrides: MockOverrides): StaysRoomRate {
  return {
    id: `mock-rate-${idx}`,
    base_amount: overrides.price,
    base_currency: overrides.currency,
    board_type: 'room_only',
    cancellation_timeline: [],
    conditions: [],
    due_at_accommodation_amount: null,
    due_at_accommodation_currency: overrides.currency,
    payment_type: 'guarantee',
    fee_amount: null,
    fee_currency: overrides.currency,
    tax_amount: null,
    tax_currency: overrides.currency,
    total_amount: overrides.price,
    total_currency: overrides.currency,
    available_payment_methods: ['balance', 'card'],
    supported_loyalty_programme: null,
    loyalty_programme_required: false,
    estimated_commission_amount: null,
    estimated_commission_currency: null,
    source: 'duffel_hotel_group',
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    code: null,
    description: null,
    quantity_available: null,
  };
}

function buildMockResult(idx: number, overrides: MockOverrides, args: StaysSearchParams, guests: Guest[]): StaysSearchResult {
  const amenities: StaysAmenity[] = overrides.amenityTypes.map(type => ({
    type,
    description: type.replace(/_/g, ' '),
  }));

  const rooms: StaysRoom[] = [
    { name: 'Standard Room', rates: [buildMockRate(idx, overrides)] },
  ];

  const accommodation: StaysAccommodation = {
    id: `mock-accommodation-${idx}`,
    amenities,
    chain: null,
    brand: null,
    check_in_information: null,
    key_collection: null,
    email: null,
    location: {
      address: {
        city_name: overrides.city_name,
        country_code: 'IE',
        line_one: overrides.line_one,
        postal_code: '',
      },
      geographic_coordinates: { latitude: args.latitude, longitude: args.longitude },
    },
    name: overrides.name,
    phone_number: null,
    photos: [{ url: overrides.photo }],
    ratings: [],
    rating: overrides.rating,
    review_count: null,
    review_score: overrides.review_score,
    rooms,
    supported_loyalty_programme: null,
  };

  return {
    id: `mock-result-${idx}`,
    check_in_date: args.check_in_date,
    check_out_date: args.check_out_date,
    accommodation,
    rooms: args.rooms ?? 1,
    guests,
    cheapest_rate_total_amount: overrides.price,
    cheapest_rate_currency: overrides.currency,
    cheapest_rate_base_amount: null,
    cheapest_rate_base_currency: null,
    cheapest_rate_public_amount: null,
    cheapest_rate_public_currency: overrides.currency,
    cheapest_rate_due_at_accommodation_amount: null,
    cheapest_rate_due_at_accommodation_currency: null,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

function findFixtureByRateId(rateId: string): MockOverrides | undefined {
  const match = /^mock-rate-(\d+)$/.exec(rateId);
  if (!match) return undefined;
  return FIXTURES[parseInt(match[1]!, 10)];
}

function randomReference(): string {
  return `MOCK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export class MockStaysProvider implements StaysProvider {
  /** Stores issued quotes so createBooking can look them up by quote_id, mirroring real server-side state. */
  private issuedQuotes = new Map<string, StaysQuote>();

  /** Stand-in for duffel.stays.search() while Duffel hasn't enabled Stays access on this account (see USE_MOCK_STAYS). */
  async search(params: StaysSearchParams): Promise<StaysSearchResponse> {
    const guests: Guest[] = Array.from({ length: params.adults ?? 1 }, () => ({ type: 'adult' as const }));

    return {
      results: FIXTURES.map((overrides, idx) => buildMockResult(idx, overrides, params, guests)),
      created_at: new Date().toISOString(),
    };
  }

  /** Stand-in for duffel.stays.quotes.create() while Duffel hasn't enabled Stays access on this account (see USE_MOCK_STAYS). */
  async createQuote(rateId: string, checkInDate: string, checkOutDate: string): Promise<StaysQuote> {
    const fixture = findFixtureByRateId(rateId);
    if (!fixture) {
      throw new Error(`Unknown mock rate_id "${rateId}" — it must come from a recent stay_search result.`);
    }

    const quote: StaysQuote = {
      id: `mock-quote-${rateId}`,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      accommodation: {
        id: `mock-accommodation-for-${rateId}`,
        amenities: null,
        chain: null,
        brand: null,
        check_in_information: null,
        key_collection: null,
        email: null,
        location: {
          address: { city_name: fixture.city_name, country_code: 'IE', line_one: fixture.line_one, postal_code: '' },
          geographic_coordinates: null,
        },
        name: fixture.name,
        phone_number: null,
        photos: [{ url: fixture.photo }],
        ratings: [],
        rating: fixture.rating,
        review_count: null,
        review_score: fixture.review_score,
        rooms: [],
        supported_loyalty_programme: null,
      },
      total_amount: fixture.price,
      total_currency: fixture.currency,
      base_amount: fixture.price,
      base_currency: fixture.currency,
      fee_amount: null,
      fee_currency: fixture.currency,
      tax_amount: null,
      tax_currency: fixture.currency,
      due_at_accommodation_amount: null,
      due_at_accommodation_currency: fixture.currency,
      deposit_amount: null,
      deposit_currency: fixture.currency,
      supported_loyalty_programme: null,
      rooms: 1,
      guests: [{ type: 'adult' }],
    };

    this.issuedQuotes.set(quote.id, quote);
    return quote;
  }

  /** Stand-in for duffel.stays.bookings.create() while Duffel hasn't enabled Stays access on this account (see USE_MOCK_STAYS). */
  async createBooking(payload: StaysBookingPayload): Promise<StaysBooking> {
    const quote = this.issuedQuotes.get(payload.quote_id);
    if (!quote) throw new Error(`Unknown mock quote_id "${payload.quote_id}" — call createQuote first.`);

    return {
      id: `mock-booking-${quote.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      email: payload.email,
      phone_number: payload.phone_number,
      accommodation: quote.accommodation,
      check_in_date: quote.check_in_date,
      check_out_date: quote.check_out_date,
      reference: randomReference(),
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      cancelled_at: null,
      guests: payload.guests.map(g => ({ given_name: g.given_name, family_name: g.family_name })),
      supported_loyalty_programme: null,
      loyalty_programme_account_number: null,
      rooms: quote.rooms,
      metadata: null,
      key_collection: null,
      estimated_commission_amount: null,
      estimated_commission_currency: null,
    };
  }
}
