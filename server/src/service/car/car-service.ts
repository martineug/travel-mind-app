import { createCarProvider } from '../../providers/car-provider';
import { createLogger } from '../../logger';
import { CarBookingRepository } from '../../repositories/car-booking-repository';
import { CarSearchParams, CarOffer, CarBookParams, CarBookingResult } from './car-types';

// Re-export types consumed by tools and controllers
export type { CarSearchParams, CarOffer, CarBookParams, CarBookingResult };

const logger = createLogger('car-service');
const provider = createCarProvider();
const carBookingRepository = new CarBookingRepository();

export async function searchCars(params: CarSearchParams): Promise<CarOffer[]> {
  logger.debugInfoCall('searchCars',
    { pickup_date: params.pickup_date, dropoff_date: params.dropoff_date },
    { pickup_location: { latitude: params.pickup_latitude, longitude: params.pickup_longitude }, driver_age: params.driver_age },
  );

  const searchRes = await provider.search({
    pickup_date: params.pickup_date,
    pickup_time: params.pickup_time,
    dropoff_date: params.dropoff_date,
    dropoff_time: params.dropoff_time,
    pickup_location: {
      geographic_coordinates: { latitude: params.pickup_latitude, longitude: params.pickup_longitude },
    },
    dropoff_location: {
      geographic_coordinates: { latitude: params.dropoff_latitude, longitude: params.dropoff_longitude },
    },
    driver: {
      age: params.driver_age ?? 30,
      residence_country_code: params.residence_country_code ?? 'IE',
    },
  });

  const results = searchRes.rates.slice(0, 10).map((r, idx) => ({
    id: `c${idx + 1}`,
    supplier: r.supplier.name,
    car_name: r.car.name,
    category: r.car.category,
    transmission: r.car.transmission,
    passengers: r.car.max_passengers,
    pickup_location: r.pickup_location.name,
    dropoff_location: r.dropoff_location.name,
    pickup_date: searchRes.pickup_date,
    dropoff_date: searchRes.dropoff_date,
    price: parseFloat(r.total_amount),
    cur: r.total_currency,
    _rate_id: r.id,
  }));

  logger.debugInfoRet('searchCars', { count: results.length });
  return results;
}

export async function bookCar(params: CarBookParams, tripId: string): Promise<CarBookingResult> {
  logger.debugInfoCall('bookCar', { rate_id: params.rate_id, tripId }, { email: params.email });

  const quote = await provider.createQuote(params.rate_id);

  const booking = await provider.createBooking({
    quote_id: quote.id,
    driver: {
      given_name:    params.given_name,
      family_name:   params.family_name,
      email:         params.email,
      phone_number:  params.phone_number,
      date_of_birth: params.date_of_birth,
    },
  });

  carBookingRepository.create({
    duffel_booking_id: booking.id,
    reference: booking.reference,
    trip_id: tripId,
    supplier_name: booking.supplier.name,
    car_name: booking.car.name,
    pickup_date: booking.pickup_date,
    dropoff_date: booking.dropoff_date,
    driver_given_name: params.given_name,
    driver_family_name: params.family_name,
    driver_email: params.email,
    driver_phone: params.phone_number,
    total_amount: quote.total_amount,
    total_currency: quote.total_currency,
    status: booking.status,
  });

  const result = {
    booking_reference: booking.reference,
    status: booking.status,
    supplier_name: booking.supplier.name,
    car_name: booking.car.name,
    pickup_date: booking.pickup_date,
    dropoff_date: booking.dropoff_date,
    total: quote.total_amount,
    currency: quote.total_currency,
  };

  logger.debugInfoRet('bookCar', { booking_reference: result.booking_reference, status: result.status, total: result.total });
  return result;
}
