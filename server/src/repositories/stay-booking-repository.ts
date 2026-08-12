import { getDb } from '../db';
import { Traveller } from '../service/flight/flight-types';

export interface StayBookingRecord {
  duffel_booking_id:  string;
  reference:          string | null;
  trip_id:            string;
  accommodation_name: string;
  check_in_date:      string;
  check_out_date:     string;
  guests:             Traveller[];
  total_amount:       string;
  total_currency:     string;
  status:             string;
}

export interface StayBookingSummary {
  id:                 number;
  reference:          string | null;
  trip_id:            string;
  accommodation_name: string;
  check_in_date:      string;
  check_out_date:     string;
  guests:             Traveller[];
  total_amount:       string;
  total_currency:     string;
  status:             string;
  created_at:         string;
}

export class StayBookingRepository {
  create(booking: StayBookingRecord): void {
    getDb().prepare(`
      INSERT INTO stay_bookings (
        duffel_booking_id, reference, trip_id, accommodation_name,
        check_in_date, check_out_date, guests,
        total_amount, total_currency, status
      ) VALUES (
        @duffel_booking_id, @reference, @trip_id, @accommodation_name,
        @check_in_date, @check_out_date, @guests,
        @total_amount, @total_currency, @status
      )
    `).run({ ...booking, guests: JSON.stringify(booking.guests) });
  }

  findByTripId(tripId: string): StayBookingSummary[] {
    const rows = getDb().prepare(`
      SELECT id, reference, trip_id, accommodation_name, check_in_date, check_out_date,
             guests, total_amount, total_currency, status, created_at
      FROM stay_bookings WHERE trip_id = ? ORDER BY created_at DESC
    `).all(tripId) as (Omit<StayBookingSummary, 'guests'> & { guests: string })[];

    return rows.map(row => ({ ...row, guests: JSON.parse(row.guests) as Traveller[] }));
  }
}
