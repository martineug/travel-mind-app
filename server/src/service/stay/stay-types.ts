// A guest is the same shape as a flight passenger, shared with traveller_profiles so someone added on a stay is reusable on a later flight.
import { Traveller } from '../flight/flight-types';

export interface StaySearchParams {
  latitude:      number;
  longitude:     number;
  check_in_date: string;
  check_out_date: string;
  adults?:       number;
  rooms?:        number;
  /** Duffel's stays.search has no budget/rating filter params — applied as post-search filtering in stay-service.ts's searchStays(). */
  max_price_per_night?: number;
  min_rating?:          number;
}

export interface StayOffer {
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
  _result_id: string;
  _rate_id: string | null;
  /** How many guests this stay was searched/priced for — the guest picker's upper bound. */
  _adults: number;
}

export interface StayBookParams {
  rate_id:        string;
  check_in_date:  string;
  check_out_date: string;
  /** One entry per guest, lead first — Duffel records only names per guest, so the lead guest's email/phone become the booking's contact. */
  guests:         Traveller[];
}

export interface StayBookingResult {
  booking_reference: string | null;
  status: string;
  accommodation_name: string;
  check_in: string;
  check_out: string;
  total: string;
  currency: string;
}
