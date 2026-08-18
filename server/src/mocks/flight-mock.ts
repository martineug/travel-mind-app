import {
  FlightOffer, FlightSearchParams, FlightBookParams, FlightBookingResult, FlightOrderData, FlightProvider,
  AirportSuggestion, Traveller,
} from '../service/flight/flight-types';
import { fmtDate } from '../utils/time-date';

const MOCK_AIRPORTS: AirportSuggestion[] = [
  { iataCode: 'DUB', name: 'Dublin Airport', cityName: 'Dublin', countryName: 'Ireland' },
  { iataCode: 'LHR', name: 'Heathrow Airport', cityName: 'London', countryName: 'United Kingdom' },
  { iataCode: 'LGW', name: 'Gatwick Airport', cityName: 'London', countryName: 'United Kingdom' },
  { iataCode: 'STN', name: 'Stansted Airport', cityName: 'London', countryName: 'United Kingdom' },
  { iataCode: 'JFK', name: 'John F. Kennedy International Airport', cityName: 'New York', countryName: 'United States' },
  { iataCode: 'LGA', name: 'LaGuardia Airport', cityName: 'New York', countryName: 'United States' },
  { iataCode: 'CDG', name: 'Charles de Gaulle Airport', cityName: 'Paris', countryName: 'France' },
  { iataCode: 'FCO', name: 'Leonardo da Vinci–Fiumicino Airport', cityName: 'Rome', countryName: 'Italy' },
  { iataCode: 'MAD', name: 'Adolfo Suárez Madrid–Barajas Airport', cityName: 'Madrid', countryName: 'Spain' },
  { iataCode: 'AMS', name: 'Amsterdam Airport Schiphol', cityName: 'Amsterdam', countryName: 'Netherlands' },
  { iataCode: 'PSA', name: 'Pisa International Airport', cityName: 'Pisa', countryName: 'Italy' },
  { iataCode: 'BCN', name: 'Josep Tarradellas Barcelona-El Prat Airport', cityName: 'Barcelona', countryName: 'Spain' },
  { iataCode: 'LIS', name: 'Humberto Delgado Airport', cityName: 'Lisbon', countryName: 'Portugal' },
  { iataCode: 'BER', name: 'Berlin Brandenburg Airport', cityName: 'Berlin', countryName: 'Germany' },
  { iataCode: 'MUC', name: 'Munich Airport', cityName: 'Munich', countryName: 'Germany' },
  { iataCode: 'MXP', name: 'Milan Malpensa Airport', cityName: 'Milan', countryName: 'Italy' },
  { iataCode: 'VIE', name: 'Vienna International Airport', cityName: 'Vienna', countryName: 'Austria' },
];

/** _adults is a property of the search, not a fixture, so it's supplied in searchFlights rather than baked into each offer. */
interface MockFlightFixture extends Omit<FlightOffer, '_adults'> {
  departure_date: string;
}

const MOCK_FLIGHTS: MockFlightFixture[] = [
  {
    id: 'f1', airline: 'Aer Lingus', flight_number: 'EI207',
    origin: 'DUB', destination: 'LHR', destination_city: null,
    dep: '07:30', arr: '08:55', date: '15 Aug', dur: '1h 25m',
    stops: 0, via: null, price: 89, cur: 'EUR', cabin: 'economy',
    left: null, _offer_id: 'mock-offer-1', departure_date: '2026-08-15',
  },
  {
    id: 'f2', airline: 'Ryanair', flight_number: 'FR8042',
    origin: 'DUB', destination: 'CDG', destination_city: null,
    dep: '10:15', arr: '13:20', date: '15 Aug', dur: '2h 05m',
    stops: 0, via: null, price: 54, cur: 'EUR', cabin: 'economy',
    left: null, _offer_id: 'mock-offer-2', departure_date: '2026-08-15',
  },
  {
    id: 'f3', airline: 'KLM Royal Dutch Airlines', flight_number: 'KL958',
    origin: 'DUB', destination: 'AMS', destination_city: null,
    dep: '13:45', arr: '16:55', date: '15 Aug', dur: '2h 10m',
    stops: 0, via: null, price: 112, cur: 'EUR', cabin: 'economy',
    left: null, _offer_id: 'mock-offer-3', departure_date: '2026-08-15',
  },
  {
    id: 'f4', airline: 'Iberia', flight_number: 'IB3164',
    origin: 'DUB', destination: 'MAD', destination_city: null,
    dep: '06:00', arr: '09:40', date: '15 Aug', dur: '2h 40m',
    stops: 0, via: null, price: 143, cur: 'EUR', cabin: 'economy',
    left: null, _offer_id: 'mock-offer-4', departure_date: '2026-08-15',
  },
  {
    id: 'f5', airline: 'Aer Lingus', flight_number: 'EI556',
    origin: 'DUB', destination: 'FCO', destination_city: null,
    dep: '07:00', arr: '11:30', date: '15 Aug', dur: '3h 30m',
    stops: 0, via: null, price: 167, cur: 'EUR', cabin: 'economy',
    left: null, _offer_id: 'mock-offer-5', departure_date: '2026-08-15',
  },
];

export class MockFlightProvider implements FlightProvider {
  /** Retains the last search params so findFixtureByOfferId can return correct origin/destination/departure_date on booking confirm. */
  private lastSearchParams: FlightSearchParams | null = null;
  private mockCounter = 1000;

  async searchFlights(params: FlightSearchParams): Promise<FlightOffer[]> {
    this.lastSearchParams = params;
    const displayDate = fmtDate(params.departure_date) ?? params.departure_date;
    // trip_type:'one-way' is authoritative over return_date's mere presence — suppresses the return leg even if a stale return_date was also passed.
    const returnDisplayDate = (params.trip_type !== 'one-way' && params.return_date)
      ? (fmtDate(params.return_date) ?? params.return_date)
      : null;

    const destinationCity = MOCK_AIRPORTS.find(a => a.iataCode === params.destination)?.cityName ?? null;

    return MOCK_FLIGHTS.map(({ departure_date: _d, ...offer }) => ({
      ...offer,
      origin:      params.origin,
      destination: params.destination,
      destination_city: destinationCity,
      date:        displayDate,
      cabin:       params.cabin_class ?? offer.cabin,
      _adults:     params.adults ?? 1,
      ...(returnDisplayDate ? {
        return_dep:  offer.dep,
        return_arr:  offer.arr,
        return_date: returnDisplayDate,
        return_dur:  offer.dur,
      } : {}),
    }));
  }

  async initiateFlightBooking(params: FlightBookParams): Promise<FlightBookingResult> {
    const fixture = this.findFixtureByOfferId(params.offer_id);
    // The mock doesn't model real per-adult pricing at search time, so approximate the total as unit price × passenger count.
    const total = fixture ? (fixture.price * params.passengers.length).toFixed(2) : '0.00';
    return {
      action:            'payment',
      client_token:      `mock_pi_token_${Date.now()}`,
      payment_intent_id: `mock_pi_${Date.now()}`,
      offer_id:          params.offer_id,
      total,
      currency:          fixture?.cur ?? 'EUR',
      passengers:        params.passengers,
    };
  }

  /** passengers is unused here (only builds order/flight metadata) — kept in the signature to satisfy FlightProvider and match the real provider's shape. */
  async confirmBooking(offer_id: string, passengers: Traveller[]): Promise<FlightOrderData> {
    const fixture = this.findFixtureByOfferId(offer_id);
    const ref = `MOCK${(++this.mockCounter).toString().padStart(4, '0')}`;
    // trip_type is authoritative over return_date's mere presence, same as searchFlights — a stale return_date must not fake a round trip.
    const returnDate = this.lastSearchParams?.trip_type !== 'one-way'
      ? (this.lastSearchParams?.return_date ?? null)
      : null;

    return {
      order_id:          `mock_order_${Date.now()}`,
      booking_reference: ref,
      total_amount:      fixture ? (fixture.price * passengers.length).toFixed(2) : '0.00',
      total_currency:    fixture?.cur ?? 'EUR',
      documents:         [],
      origin:            fixture?.origin ?? '',
      destination:       fixture?.destination ?? '',
      departure_date:    fixture?.departure_date ?? '',
      return_date:       returnDate,
      airline:           fixture?.airline ?? null,
      flight_number:     fixture?.flight_number ?? null,
      dep:               fixture?.dep ?? null,
      arr:               fixture?.arr ?? null,
      dur:               fixture?.dur ?? null,
      // Mock fixtures don't model a distinct return leg — echo the outbound leg's own times, same simplification searchFlights() makes.
      ...(returnDate ? { return_dep: fixture?.dep ?? null, return_arr: fixture?.arr ?? null, return_dur: fixture?.dur ?? null } : {}),
    };
  }

  async suggestAirports(query: string): Promise<AirportSuggestion[]> {
    const q = query.toLowerCase();
    return MOCK_AIRPORTS.filter(a =>
      a.name.toLowerCase().includes(q) || a.cityName?.toLowerCase().includes(q) || a.iataCode.toLowerCase().includes(q),
    );
  }

  private findFixtureByOfferId(offerId: string): MockFlightFixture | undefined {
    const fixture = MOCK_FLIGHTS.find(f => f._offer_id === offerId);
    if (!fixture) return undefined;
    if (!this.lastSearchParams) return fixture;
    return {
      ...fixture,
      origin:         this.lastSearchParams.origin,
      destination:    this.lastSearchParams.destination,
      departure_date: this.lastSearchParams.departure_date,
    };
  }
}
