import { getDb } from '../db';
import { Traveller } from '../service/flight/flight-types';

export interface FlightBookingRecord {
  order_id:              string;
  booking_reference:     string | null;
  offer_id:              string;
  trip_id:               string;
  origin:                string;
  destination:           string;
  departure_date:        string;
  return_date:           string | null;
  airline:               string | null;
  flight_number:         string | null;
  dep:                   string | null;
  arr:                   string | null;
  dur:                   string | null;
  return_dep:            string | null;
  return_arr:            string | null;
  return_dur:            string | null;
  passengers:            Traveller[];
  total_amount:          string;
  total_currency:        string;
  documents:             string[];
  payment_intent_id:     string;
}

export interface FlightBookingSummary {
  id:                    number;
  order_id:              string;
  booking_reference:     string | null;
  trip_id:               string;
  origin:                string;
  destination:           string;
  departure_date:        string;
  return_date:           string | null;
  airline:               string | null;
  flight_number:         string | null;
  dep:                   string | null;
  arr:                   string | null;
  dur:                   string | null;
  return_dep:            string | null;
  return_arr:            string | null;
  return_dur:            string | null;
  passengers:            Traveller[];
  total_amount:          string;
  total_currency:        string;
  created_at:            string;
}

export class FlightBookingRepository {
  create(booking: FlightBookingRecord): void {
    getDb().prepare(`
      INSERT INTO flight_bookings (
        order_id, booking_reference, offer_id,
        trip_id, origin, destination, departure_date, return_date,
        airline, flight_number, dep, arr, dur, return_dep, return_arr, return_dur,
        passengers,
        total_amount, total_currency, documents, payment_intent_id
      ) VALUES (
        @order_id, @booking_reference, @offer_id,
        @trip_id, @origin, @destination, @departure_date, @return_date,
        @airline, @flight_number, @dep, @arr, @dur, @return_dep, @return_arr, @return_dur,
        @passengers,
        @total_amount, @total_currency, @documents, @payment_intent_id
      )
    `).run({
      ...booking,
      passengers: JSON.stringify(booking.passengers),
      documents: JSON.stringify(booking.documents),
    });
  }

  findByTripId(tripId: string): FlightBookingSummary[] {
    const rows = getDb().prepare(`
      SELECT id, order_id, booking_reference, trip_id, origin, destination, departure_date, return_date,
             airline, flight_number, dep, arr, dur, return_dep, return_arr, return_dur,
             passengers, total_amount, total_currency, created_at
      FROM flight_bookings WHERE trip_id = ? ORDER BY created_at DESC
    `).all(tripId) as (Omit<FlightBookingSummary, 'passengers'> & { passengers: string })[];

    return rows.map(row => ({ ...row, passengers: JSON.parse(row.passengers) as Traveller[] }));
  }
}
