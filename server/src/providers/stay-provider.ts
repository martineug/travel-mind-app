import { Duffel } from '@duffel/api';
import { StaysBooking, StaysQuote, StaysSearchResponse } from '@duffel/api/dist/Stays/StaysTypes';
import { StaysBookingPayload } from '@duffel/api/dist/Stays/Bookings/Bookings';
import { withDuffelRetry } from './duffel-retry';
import config from '../config';
import { MockStaysProvider } from '../mocks/stay-mock';

const SEARCH_RADIUS_METERS = 5000;

export interface StaysSearchParams {
  latitude: number;
  longitude: number;
  check_in_date: string;
  check_out_date: string;
  adults?: number;
  rooms?: number;
}

export interface StaysProvider {
  search(params: StaysSearchParams): Promise<StaysSearchResponse>;
  createQuote(rateId: string, checkInDate: string, checkOutDate: string): Promise<StaysQuote>;
  createBooking(payload: StaysBookingPayload): Promise<StaysBooking>;
}

export class RealStaysProvider implements StaysProvider {
  private duffel: Duffel;

  constructor() {
    this.duffel = new Duffel({ token: config.DUFFEL_API_KEY });
  }

  async search(params: StaysSearchParams): Promise<StaysSearchResponse> {
    const res = await withDuffelRetry(() => this.duffel.stays.search({
      check_in_date: params.check_in_date,
      check_out_date: params.check_out_date,
      rooms: params.rooms ?? 1,
      guests: Array.from({ length: params.adults ?? 1 }, () => ({ type: 'adult' as const })),
      location: {
        radius: SEARCH_RADIUS_METERS,
        geographic_coordinates: { latitude: params.latitude, longitude: params.longitude },
      },
    }));
    return res.data;
  }

  async createQuote(rateId: string): Promise<StaysQuote> {
    const res = await withDuffelRetry(() => this.duffel.stays.quotes.create(rateId));
    return res.data;
  }

  // Not retried — a lost response after this actually succeeded server-side would risk a
  // duplicate booking, same reasoning as flight-provider.ts's orders.create.
  async createBooking(payload: StaysBookingPayload): Promise<StaysBooking> {
    const res = await this.duffel.stays.bookings.create(payload);
    return res.data;
  }
}

export function createStaysProvider(): StaysProvider {
  return config.useMockStays ? new MockStaysProvider() : new RealStaysProvider();
}
