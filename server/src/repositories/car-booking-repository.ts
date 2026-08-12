import { getDb } from '../db';

// Both snake_case, matching the DB columns verbatim — unlike a domain type (e.g. CallMetricRecord),
// neither is converted to/from camelCase, so they belong here rather than in model/.
interface CarBookingRecord {
  duffel_booking_id:  string;
  reference:          string | null;
  trip_id:            string;
  supplier_name:      string;
  car_name:           string;
  pickup_date:        string;
  dropoff_date:       string;
  driver_given_name:  string;
  driver_family_name: string;
  driver_email:       string;
  driver_phone:       string;
  total_amount:       string;
  total_currency:     string;
  status:             string;
}

// Exported — unlike CarBookingRecord, this crosses into itinerary-pdf-service.ts */
export interface CarBookingSummary {
  id:                 number;
  reference:          string | null;
  trip_id:            string;
  supplier_name:      string;
  car_name:           string;
  pickup_date:        string;
  dropoff_date:       string;
  driver_given_name:  string;
  driver_family_name: string;
  total_amount:       string;
  total_currency:     string;
  status:             string;
  created_at:         string;
}

export class CarBookingRepository {
  create(booking: CarBookingRecord): void {
    getDb().prepare(`
      INSERT INTO car_bookings (
        duffel_booking_id, reference, trip_id, supplier_name, car_name,
        pickup_date, dropoff_date,
        driver_given_name, driver_family_name, driver_email, driver_phone,
        total_amount, total_currency, status
      ) VALUES (
        @duffel_booking_id, @reference, @trip_id, @supplier_name, @car_name,
        @pickup_date, @dropoff_date,
        @driver_given_name, @driver_family_name, @driver_email, @driver_phone,
        @total_amount, @total_currency, @status
      )
    `).run(booking);
  }

  findByTripId(tripId: string): CarBookingSummary[] {
    return getDb().prepare(`
      SELECT id, reference, trip_id, supplier_name, car_name, pickup_date, dropoff_date,
             driver_given_name, driver_family_name, total_amount, total_currency, status, created_at
      FROM car_bookings WHERE trip_id = ? ORDER BY created_at DESC
    `).all(tripId) as CarBookingSummary[];
  }
}
