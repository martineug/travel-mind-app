import { Traveller } from './traveller';

export interface Flight {
  id: string;
  airline: string;
  flight_number: string;
  origin: string;
  destination: string;
  destination_city: string | null;
  dep: string;
  arr: string;
  date: string;
  dur: string;
  stops: number;
  via: string | null;
  price: number;
  cur: string;
  cabin: string;
  left: number;
  /** Duffel's offer id + traveller count it was priced for */
  _offer_id: string;
  _adults: number;
  /** Present only when the search was round-trip. */
  return_dep?: string | null;
  return_arr?: string | null;
  return_date?: string | null;
  return_dur?: string | null;
  return_stops?: number;
  return_via?: string | null;
}

/** Payment intent for a flight chosen in the UI. Same shape the payment sheet already
 *  consumes, but returned straight from the booking API rather than relayed by the agent. */
export interface InitiateBookingResponse {
  action: 'payment';
  message: string;
  client_token: string;
  payment_intent_id: string;
  offer_id: string;
  total: string;
  currency: string;
  passengers: Traveller[];
}

export interface PaymentIntentData {
  client_token:       string;
  payment_intent_id:  string;
  offer_id:           string;
  total:              string;
  currency:           string;
  passengers:         Traveller[];
  /** IATA code of the flight's destination — carried through only from a fresh booking (not
   *  history restore) so the post-booking hint chip can name it. */
  destination?:       string;
  /** Trip active when payment was initiated */
  trip_id:            string;
  /** The chat this payment sheet belongs to so the chat's last message
   *  stops being the unpaid "payment" action on reload */
  chat_id:            string;
}

export interface ConfirmBookingResponse {
  order_id:           string;
  booking_reference:  string;
  total:              string;
  documents:          string[];
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
