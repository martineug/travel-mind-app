import { randomUUID } from 'crypto';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db', async () => {
  const { createTestDb } = await import('../../test-utils/create-test-db');
  const testDb = createTestDb();
  return { getDb: () => testDb };
});

import { buildItineraryPdf, findEarliestBookingDate } from './itinerary-pdf-service';
import { FlightBookingRepository } from '../../repositories/flight-booking-repository';
import { StayBookingRepository } from '../../repositories/stay-booking-repository';
import { CarBookingRepository } from '../../repositories/car-booking-repository';

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length > 0 && buf.subarray(0, 4).toString('ascii') === '%PDF';
}

describe('buildItineraryPdf', () => {
  it('returns a valid, non-empty PDF for a trip with no bookings', async () => {
    const pdf = await buildItineraryPdf(randomUUID());
    expect(isPdfBuffer(pdf)).toBe(true);
  });

  it('returns a valid PDF for a trip with flight, stay, and car bookings', async () => {
    const tripId = randomUUID();

    new FlightBookingRepository().create({
      order_id: 'ord_1', booking_reference: 'ABC123', offer_id: 'offer_1', trip_id: tripId,
      origin: 'DUB', destination: 'CDG', departure_date: '2026-09-10', return_date: null,
      airline: 'Aer Lingus', flight_number: 'EI600', dep: '10:00', arr: '12:00', dur: '2h 00m',
      return_dep: null, return_arr: null, return_dur: null,
      passengers: [{ given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com', phone_number: '+353861234567', born_on: '1990-01-01', gender: 'f', title: 'ms' }],
      total_amount: '199.99', total_currency: 'EUR', documents: [], payment_intent_id: 'pi_1',
    });

    new StayBookingRepository().create({
      duffel_booking_id: 'stay_1', reference: 'STAYREF1', trip_id: tripId,
      accommodation_name: 'Hotel Ritz', check_in_date: '2026-09-10', check_out_date: '2026-09-12',
      guests: [{ given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com', phone_number: '+353861234567', born_on: '1990-01-01', gender: 'f', title: 'ms' }],
      total_amount: '300.00', total_currency: 'EUR', status: 'confirmed',
    });

    new CarBookingRepository().create({
      duffel_booking_id: 'car_1', reference: 'CARREF1', trip_id: tripId,
      supplier_name: 'Hertz', car_name: 'VW Golf', pickup_date: '2026-09-10', dropoff_date: '2026-09-12',
      driver_given_name: 'Ada', driver_family_name: 'Lovelace', driver_email: 'ada@example.com', driver_phone: '+353861234567',
      total_amount: '99.00', total_currency: 'EUR', status: 'confirmed',
    });

    const pdf = await buildItineraryPdf(tripId);
    expect(isPdfBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(500);
  });
});

describe('findEarliestBookingDate', () => {
  it('returns null for a trip with no bookings', () => {
    expect(findEarliestBookingDate(randomUUID())).toBeNull();
  });

  it('picks the true earliest date across mixed flight/stay/car bookings, regardless of type', () => {
    const tripId = randomUUID();

    new FlightBookingRepository().create({
      order_id: randomUUID(), booking_reference: 'ABC123', offer_id: 'offer_1', trip_id: tripId,
      origin: 'DUB', destination: 'CDG', departure_date: '2026-09-10', return_date: null,
      airline: 'Aer Lingus', flight_number: 'EI600', dep: '10:00', arr: '12:00', dur: '2h 00m',
      return_dep: null, return_arr: null, return_dur: null,
      passengers: [{ given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com', phone_number: '+353861234567', born_on: '1990-01-01', gender: 'f', title: 'ms' }],
      total_amount: '199.99', total_currency: 'EUR', documents: [], payment_intent_id: 'pi_1',
    });
    new StayBookingRepository().create({
      duffel_booking_id: randomUUID(), reference: 'STAYREF1', trip_id: tripId,
      accommodation_name: 'Hotel Ritz', check_in_date: '2026-09-01', check_out_date: '2026-09-12',
      guests: [{ given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com', phone_number: '+353861234567', born_on: '1990-01-01', gender: 'f', title: 'ms' }],
      total_amount: '300.00', total_currency: 'EUR', status: 'confirmed',
    });
    new CarBookingRepository().create({
      duffel_booking_id: randomUUID(), reference: 'CARREF1', trip_id: tripId,
      supplier_name: 'Hertz', car_name: 'VW Golf', pickup_date: '2026-08-01', dropoff_date: '2026-09-12',
      driver_given_name: 'Ada', driver_family_name: 'Lovelace', driver_email: 'ada@example.com', driver_phone: '+353861234567',
      total_amount: '99.00', total_currency: 'EUR', status: 'confirmed',
    });

    // The car's pickup_date (Aug 1) is the earliest of the three — no type priority anymore.
    expect(findEarliestBookingDate(tripId)).toEqual(new Date('2026-08-01'));
  });

  it('matches the earliest of several stays when there is no flight or car', () => {
    const tripId = randomUUID();

    new StayBookingRepository().create({
      duffel_booking_id: randomUUID(), reference: 'STAYREF1', trip_id: tripId,
      accommodation_name: 'Later Hotel', check_in_date: '2026-09-15', check_out_date: '2026-09-20',
      guests: [{ given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com', phone_number: '+353861234567', born_on: '1990-01-01', gender: 'f', title: 'ms' }],
      total_amount: '300.00', total_currency: 'EUR', status: 'confirmed',
    });
    new StayBookingRepository().create({
      duffel_booking_id: randomUUID(), reference: 'STAYREF2', trip_id: tripId,
      accommodation_name: 'Earlier Hotel', check_in_date: '2026-09-05', check_out_date: '2026-09-10',
      guests: [{ given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com', phone_number: '+353861234567', born_on: '1990-01-01', gender: 'f', title: 'ms' }],
      total_amount: '150.00', total_currency: 'EUR', status: 'confirmed',
    });

    expect(findEarliestBookingDate(tripId)).toEqual(new Date('2026-09-05'));
  });

  it('matches a single car booking\'s pickup date when that is the only booking', () => {
    const tripId = randomUUID();

    new CarBookingRepository().create({
      duffel_booking_id: randomUUID(), reference: 'CARREF1', trip_id: tripId,
      supplier_name: 'Hertz', car_name: 'VW Golf', pickup_date: '2026-08-01', dropoff_date: '2026-08-05',
      driver_given_name: 'Ada', driver_family_name: 'Lovelace', driver_email: 'ada@example.com', driver_phone: '+353861234567',
      total_amount: '99.00', total_currency: 'EUR', status: 'confirmed',
    });

    expect(findEarliestBookingDate(tripId)).toEqual(new Date('2026-08-01'));
  });
});
