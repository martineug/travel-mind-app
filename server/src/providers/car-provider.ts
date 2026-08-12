import { Duffel } from '@duffel/api';
import { CarsSearch, CarsSearchParams, CarsQuote, CarsBooking } from '@duffel/api/dist/Cars/CarsTypes';
import { CarsBookingPayload } from '@duffel/api/dist/Cars/Bookings/Bookings';
import { withDuffelRetry } from './duffel-retry';
import config from '../config';
import { MockCarProvider } from '../mocks/car-mock';

export interface CarProvider {
  search(params: CarsSearchParams): Promise<CarsSearch>;
  createQuote(rateId: string): Promise<CarsQuote>;
  createBooking(payload: CarsBookingPayload): Promise<CarsBooking>;
}

export class RealCarProvider implements CarProvider {
  private duffel: Duffel;

  constructor() {
    this.duffel = new Duffel({ token: config.DUFFEL_API_KEY });
  }

  async search(params: CarsSearchParams): Promise<CarsSearch> {
    const res = await withDuffelRetry(() => this.duffel.cars.search(params));
    return res.data;
  }

  async createQuote(rateId: string): Promise<CarsQuote> {
    const res = await withDuffelRetry(() => this.duffel.cars.quotes.create(rateId));
    return res.data;
  }

  async createBooking(payload: CarsBookingPayload): Promise<CarsBooking> {
    const res = await this.duffel.cars.bookings.create(payload);
    return res.data;
  }
}

export function createCarProvider(): CarProvider {
  return config.useMockCars ? new MockCarProvider() : new RealCarProvider();
}
