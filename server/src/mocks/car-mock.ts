import {
  Car,
  CarsBooking,
  CarsCategory,
  CarsFuel,
  CarsGeographicCoordinates,
  CarsLocation,
  CarsQuote,
  CarsRate,
  CarsSearch,
  CarsSearchParams,
  CarsTransmission,
  CarsVehicleType,
} from '@duffel/api/dist/Cars/CarsTypes';
import { CarsBookingPayload } from '@duffel/api/dist/Cars/Bookings/Bookings';
import type { CarProvider } from '../providers/car-provider';

interface MockOverrides {
  supplier: string;
  carName: string;
  category: CarsCategory;
  type: CarsVehicleType;
  transmission: CarsTransmission;
  fuel: CarsFuel;
  maxPassengers: number;
  price: string;
  currency: string;
}

const FIXTURES: MockOverrides[] = [
  { supplier: 'Hertz',      carName: 'Volkswagen Golf or similar',    category: 'compact',      type: 'four_door',    transmission: 'manual',    fuel: 'petrol', maxPassengers: 5, price: '45.00', currency: 'EUR' },
  { supplier: 'Avis',       carName: 'Toyota Corolla or similar',     category: 'economy',      type: 'four_door',    transmission: 'automatic', fuel: 'petrol', maxPassengers: 5, price: '38.00', currency: 'EUR' },
  { supplier: 'Europcar',   carName: 'Ford Focus Estate or similar',  category: 'intermediate', type: 'wagon_estate', transmission: 'manual',    fuel: 'diesel', maxPassengers: 5, price: '52.00', currency: 'EUR' },
  { supplier: 'Sixt',       carName: 'BMW 3 Series or similar',       category: 'premium',      type: 'four_door',    transmission: 'automatic', fuel: 'petrol', maxPassengers: 5, price: '89.00', currency: 'EUR' },
  { supplier: 'Enterprise', carName: 'Nissan Qashqai or similar',     category: 'standard',     type: 'suv',          transmission: 'automatic', fuel: 'hybrid', maxPassengers: 5, price: '64.00', currency: 'EUR' },
  { supplier: 'Budget',     carName: 'Fiat 500 or similar',           category: 'mini',         type: 'two_door',     transmission: 'manual',    fuel: 'petrol', maxPassengers: 4, price: '29.00', currency: 'EUR' },
];

function buildMockLocation(coords: CarsGeographicCoordinates, name: string): CarsLocation {
  return {
    name,
    geographic_coordinates: coords,
    address: { line_one: null, city_name: null, postal_code: null, region: null, country_code: 'IE' },
    phone_number: null,
    access: null,
    additional_information: [],
    opening_hours: [],
  };
}

function buildMockCar(overrides: MockOverrides): Car {
  return {
    name: overrides.carName,
    code: 'CDMR',
    category: overrides.category,
    type: overrides.type,
    transmission: overrides.transmission,
    fuel: overrides.fuel,
    air_conditioning: true,
    max_passengers: overrides.maxPassengers,
    baggage: { large: 2, small: 1 },
    images: null,
  };
}

function buildMockRate(idx: number, overrides: MockOverrides, params: CarsSearchParams): CarsRate {
  return {
    id: `mock-car-rate-${idx}`,
    base_amount: overrides.price,
    base_currency: overrides.currency,
    total_amount: overrides.price,
    total_currency: overrides.currency,
    payment_type: 'guarantee',
    mileage: { type: 'unlimited' },
    supplier: { name: overrides.supplier, logo_url: null },
    car: buildMockCar(overrides),
    pickup_location: buildMockLocation(params.pickup_location.geographic_coordinates, `${overrides.supplier} Pickup`),
    dropoff_location: buildMockLocation(params.dropoff_location.geographic_coordinates, `${overrides.supplier} Dropoff`),
  };
}

function findFixtureByRateId(rateId: string): MockOverrides | undefined {
  const match = /^mock-car-rate-(\d+)$/.exec(rateId);
  if (!match) return undefined;
  return FIXTURES[parseInt(match[1]!, 10)];
}

function randomReference(): string {
  return `MOCK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export class MockCarProvider implements CarProvider {
  /** Retains the last search params so createQuote can echo consistent pickup/dropoff dates and locations. */
  private lastSearchParams: CarsSearchParams | null = null;
  /** Stores issued quotes so createBooking can look them up by quote_id, mirroring real server-side state. */
  private issuedQuotes = new Map<string, CarsQuote>();

  /** Stand-in for duffel.cars.search() while Duffel hasn't enabled Cars access on this account (see USE_MOCK_CARS). */
  async search(params: CarsSearchParams): Promise<CarsSearch> {
    this.lastSearchParams = params;

    return {
      id: `mock-car-search-${Date.now()}`,
      live_mode: false,
      created_at: new Date().toISOString(),
      pickup_date: params.pickup_date,
      pickup_time: params.pickup_time,
      dropoff_date: params.dropoff_date,
      dropoff_time: params.dropoff_time,
      pickup_location: params.pickup_location,
      dropoff_location: params.dropoff_location,
      driver: params.driver,
      rates: FIXTURES.map((overrides, idx) => buildMockRate(idx, overrides, params)),
    };
  }

  /** Stand-in for duffel.cars.quotes.create() while Duffel hasn't enabled Cars access on this account (see USE_MOCK_CARS). */
  async createQuote(rateId: string): Promise<CarsQuote> {
    const fixture = findFixtureByRateId(rateId);
    if (!fixture) {
      throw new Error(`Unknown mock rate_id "${rateId}" — it must come from a recent car_search result.`);
    }
    if (!this.lastSearchParams) {
      throw new Error('createQuote called before search — no pickup/dropoff context available.');
    }

    const params = this.lastSearchParams;
    const quote: CarsQuote = {
      id: `mock-car-quote-${rateId}`,
      live_mode: false,
      rate_id: rateId,
      search_id: 'mock-search',
      base_amount: fixture.price,
      base_currency: fixture.currency,
      total_amount: fixture.price,
      total_currency: fixture.currency,
      charges: null,
      payment_type: 'guarantee',
      mileage: { type: 'unlimited' },
      supplier: { name: fixture.supplier, logo_url: null },
      car: buildMockCar(fixture),
      conditions: [],
      privacy_policies: null,
      pickup_location: buildMockLocation(params.pickup_location.geographic_coordinates, `${fixture.supplier} Pickup`),
      dropoff_location: buildMockLocation(params.dropoff_location.geographic_coordinates, `${fixture.supplier} Dropoff`),
      pickup_date: params.pickup_date,
      pickup_time: params.pickup_time,
      dropoff_date: params.dropoff_date,
      dropoff_time: params.dropoff_time,
    };

    this.issuedQuotes.set(quote.id, quote);
    return quote;
  }

  /** Stand-in for duffel.cars.bookings.create() while Duffel hasn't enabled Cars access on this account (see USE_MOCK_CARS). */
  async createBooking(payload: CarsBookingPayload): Promise<CarsBooking> {
    const quote = this.issuedQuotes.get(payload.quote_id);
    if (!quote) throw new Error(`Unknown mock quote_id "${payload.quote_id}" — call createQuote first.`);

    return {
      id: `mock-car-booking-${quote.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      live_mode: false,
      reference: randomReference(),
      confirmed_at: new Date().toISOString(),
      cancelled_at: null,
      status: 'confirmed',
      driver: {
        given_name: payload.driver.given_name,
        family_name: payload.driver.family_name,
        date_of_birth: payload.driver.date_of_birth,
        email: payload.driver.email,
        phone_number: payload.driver.phone_number,
        user_id: null,
      },
      quote_id: quote.id,
      base_amount: quote.base_amount,
      base_currency: quote.base_currency,
      total_amount: quote.total_amount,
      total_currency: quote.total_currency,
      charges: null,
      payment_type: quote.payment_type,
      mileage: quote.mileage,
      supplier: quote.supplier,
      metadata: null,
      users: [],
      car: quote.car,
      conditions: quote.conditions,
      privacy_policies: quote.privacy_policies,
      pickup_location: quote.pickup_location,
      dropoff_location: quote.dropoff_location,
      pickup_date: quote.pickup_date,
      pickup_time: quote.pickup_time,
      dropoff_date: quote.dropoff_date,
      dropoff_time: quote.dropoff_time,
    };
  }
}
