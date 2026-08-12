export interface FlightSearchParams {
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string;
  /** Explicit signal, authoritative over return_date's mere presence — a stale return_date
   *  (e.g. a disabled-but-uncleared wizard field) must not turn a one-way search round-trip. */
  trip_type?: 'round trip' | 'one-way';
  cabin_class?: string;
  adults?: number;
}

export interface FlightOffer {
  id: string;
  airline: string;
  flight_number: string | null;
  origin: string;
  destination: string;
  dep: string | null;
  arr: string | null;
  date: string | null;
  dur: string | null;
  stops: number;
  via: string | null;
  price: number;
  cur: string;
  cabin: string;
  left: null;
  _offer_id: string;
  /** How many travellers this offer was priced for — fixed at search time (Duffel can't add slots), so the picker requires exactly this many. */
  _adults: number;
  /** Present only when the search was round-trip (return_date was given). */
  return_dep?: string | null;
  return_arr?: string | null;
  return_date?: string | null;
  return_dur?: string | null;
  return_stops?: number;
  return_via?: string | null;
}

export interface FlightBookParams {
  offer_id:   string;
  passengers: Traveller[];
}

export interface FlightBookingResult {
  action: 'payment';
  client_token: string;
  payment_intent_id: string;
  offer_id: string;
  total: string;
  currency: string;
  passengers: Traveller[];
}

export interface Traveller {
  given_name:   string;
  family_name:  string;
  email:        string;
  phone_number: string;
  born_on:      string;
  gender:       'm' | 'f';
  title:        'mr' | 'ms' | 'mrs' | 'miss';
}

export interface FlightOrderData {
  order_id:          string;
  booking_reference: string | null;
  total_amount:      string;
  total_currency:    string;
  documents:         string[];
  origin:            string;
  destination:       string;
  departure_date:    string;
  /** Present only when the booked offer was round-trip. */
  return_date?:      string | null;
  /** Flight details matching what was actually searched/selected, so the itinerary shows more than just the route/date. */
  airline:           string | null;
  flight_number:     string | null;
  dep:               string | null;
  arr:               string | null;
  dur:               string | null;
  return_dep?:       string | null;
  return_arr?:       string | null;
  return_dur?:       string | null;
}

export interface ConfirmBookingResult {
  order_id:          string;
  booking_reference: string | null;
  total:             string;
  documents:         string[];
}

export interface AirportSuggestion {
  iataCode: string;
  name: string;
  cityName: string | null;
  countryName: string | null;
}

export interface FlightProvider {
  searchFlights(params: FlightSearchParams): Promise<FlightOffer[]>;
  initiateFlightBooking(params: FlightBookParams): Promise<FlightBookingResult>;
  confirmBooking(offer_id: string, passengers: Traveller[], payment_intent_id: string): Promise<FlightOrderData>;
  suggestAirports(query: string): Promise<AirportSuggestion[]>;
}
