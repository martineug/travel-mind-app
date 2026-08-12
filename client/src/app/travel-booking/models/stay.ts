import { Traveller } from './traveller';

export interface Stay {
  id: string;
  name: string;
  rating: number | null;
  review_score: number | null;
  city: string;
  address: string;
  photo: string | null;
  price: number;
  cur: string;
  check_in: string;
  check_out: string;
  amenities: string[];
  /** Duffel's rate id + guest count the stay was priced for */
  _rate_id: string;
  _adults: number;
}

/** Confirmation returned by the client-driven stay booking, no payment step */
export interface StayBookingResult {
  booking_reference: string | null;
  status: string;
  accommodation_name: string;
  check_in: string;
  check_out: string;
  total: string;
  currency: string;
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
