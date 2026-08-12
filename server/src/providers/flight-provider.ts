import { Duffel } from '@duffel/api';
import { withDuffelRetry } from './duffel-retry';
import config from '../config';
import { fmtTime, fmtDate, fmtDuration } from '../utils/time-date';
import {
  FlightSearchParams, FlightOffer, FlightBookParams, FlightBookingResult,
  Traveller, FlightOrderData, FlightProvider, AirportSuggestion,
} from '../service/flight/flight-types';
import { MockFlightProvider } from '../mocks/flight-mock';

/** This marker property lets flight-service.ts's catch turn it into a 400 BookingError
 *  (caller/prompt mistake) rather than a 500, while the message stays human-readable.
 *  Thrown as a plain Error here — importing BookingError would be circular. */
export interface TravellerCountMismatchError extends Error {
  travellerCountMismatch: true;
}

export function isTravellerCountMismatch(err: unknown): err is TravellerCountMismatchError {
  return !!err && typeof err === 'object' && (err as any).travellerCountMismatch === true;
}

function assertTravellerCount(provided: number, expected: number): void {
  if (provided !== expected) {
    const err = new Error(`This flight was searched for ${expected} passenger(s), but ${provided} passenger(s) were provided. Re-run the search with the right number of adults, or provide exactly ${expected} passenger(s).`) as TravellerCountMismatchError;
    err.travellerCountMismatch = true;
    throw err;
  }
}

export class RealFlightProvider implements FlightProvider {
  private duffel: Duffel;

  constructor() {
    this.duffel = new Duffel({ token: config.DUFFEL_API_KEY });
  }

  async searchFlights(params: FlightSearchParams): Promise<FlightOffer[]> {
    // trip_type:'one-way' is authoritative over return_date's mere presence — suppresses the return leg even if a stale return_date was also passed.
    const isRoundTrip = params.trip_type !== 'one-way' && !!params.return_date;

    const slices = [{
      origin: params.origin,
      destination: params.destination,
      departure_date: params.departure_date,
      arrival_time: null,
      departure_time: null,
    }];

    if (isRoundTrip) {
      slices.push({
        origin: params.destination,
        destination: params.origin,
        departure_date: params.return_date!,
        arrival_time: null,
        departure_time: null,
      });
    }

    const offerRequest = await withDuffelRetry(() => this.duffel.offerRequests.create({
      slices,
      passengers: Array.from({ length: params.adults ?? 1 }, () => ({ type: 'adult' as const })),
      cabin_class: (params.cabin_class ?? 'economy') as 'economy' | 'premium_economy' | 'business' | 'first',
    }));

    const offers = offerRequest.data.offers.slice(0, 5);

    return offers.map((o, idx) => {
      const outbound = this.mapSlice(o.slices?.[0], params.origin, params.destination);
      const inbound = isRoundTrip ? this.mapSlice(o.slices?.[1], params.destination, params.origin) : null;

      return {
        id:             `f${idx + 1}`,
        airline:        outbound.airline,
        flight_number:  outbound.flight_number,
        origin:         outbound.origin,
        destination:    outbound.destination,
        dep:   outbound.dep,
        arr:   outbound.arr,
        date:  outbound.date,
        dur:   outbound.dur,
        stops: outbound.stops,
        via:   outbound.via,
        price: parseFloat(o.total_amount),
        cur:   o.total_currency,
        cabin: params.cabin_class ?? 'economy',
        left:  null,
        _offer_id: o.id,
        _adults: params.adults ?? 1,
        ...(inbound ? {
          return_dep:   inbound.dep,
          return_arr:   inbound.arr,
          return_date:  inbound.date,
          return_dur:   inbound.dur,
          return_stops: inbound.stops,
          return_via:   inbound.via,
        } : {}),
      };
    });
  }

  /** Extracts display fields (airline/times/stops) from one Duffel offer slice. */
  private mapSlice(slice: any, fallbackOrigin: string, fallbackDestination: string) {
    const segments = slice?.segments ?? [];
    const first = segments[0];
    const last  = segments[segments.length - 1];
    const via   = segments.slice(1).map((s: any) => s.origin?.iata_code).filter(Boolean);

    return {
      airline:        first?.operating_carrier?.name ?? first?.marketing_carrier?.name ?? 'Unknown',
      flight_number:  first?.marketing_carrier_flight_number
        ? `${first?.marketing_carrier?.iata_code ?? ''}${first.marketing_carrier_flight_number}`
        : null,
      origin:      first?.origin?.iata_code ?? fallbackOrigin,
      destination: last?.destination?.iata_code ?? fallbackDestination,
      dep:  fmtTime(first?.departing_at),
      arr:  fmtTime(last?.arriving_at),
      date: fmtDate(first?.departing_at),
      dur:  fmtDuration(slice?.duration as string | undefined),
      stops: segments.length - 1,
      via:   via.length > 0 ? via.join(', ') : null,
    };
  }

  async initiateFlightBooking(params: FlightBookParams): Promise<FlightBookingResult> {
    const offer = await withDuffelRetry(() => this.duffel.offers.get(params.offer_id));
    const { total_amount, total_currency } = offer.data;

    // The offer's passenger-slot count was fixed at search time; fail here before creating
    // a payment intent if it doesn't match — Duffel can't add slots to an existing offer.
    assertTravellerCount(params.passengers.length, offer.data.passengers.length);

    // Not retried — a lost response after this actually succeeded server-side would risk
    // creating a second payment intent for the same offer.
    const intentRes = await this.duffel.paymentIntents.create({
      amount: total_amount,
      currency: total_currency,
    });

    const intent = intentRes.data;

    return {
      action:            'payment',
      client_token:      intent.client_token,
      payment_intent_id: intent.id,
      offer_id:          params.offer_id,
      total:             total_amount,
      currency:          total_currency,
      passengers:        params.passengers,
    };
  }

  async confirmBooking(offer_id: string, passengers: Traveller[], payment_intent_id: string): Promise<FlightOrderData> {
    const offer = await withDuffelRetry(() => this.duffel.offers.get(offer_id));

    const segments     = offer.data.slices?.[0]?.segments ?? [];
    const origin       = (segments[0] as any)?.origin?.iata_code ?? '';
    const destination  = (segments[segments.length - 1] as any)?.destination?.iata_code ?? '';
    const departure_date = ((segments[0] as any)?.departing_at as string | undefined)?.slice(0, 10) ?? '';

    const returnSegments = offer.data.slices?.[1]?.segments ?? [];
    const return_date = returnSegments.length
      ? ((returnSegments[0] as any)?.departing_at as string | undefined)?.slice(0, 10) ?? null
      : null;

    // Same extraction searchFlights() uses for display fields — reused so the confirmed
    // booking's stored details match what the search results actually showed.
    const outbound = this.mapSlice(offer.data.slices?.[0], origin, destination);
    const inbound = returnSegments.length ? this.mapSlice(offer.data.slices?.[1], destination, origin) : null;

    // Zip each real passenger to its Duffel offer slot by index — slots were created at search
    // time so count/order line up. Guarded above so a mismatch never silently books wrong identities.
    assertTravellerCount(passengers.length, offer.data.passengers.length);
    const orderTravellers = offer.data.passengers.map((p, i) => ({
      id:           p.id,
      given_name:   passengers[i]!.given_name,
      family_name:  passengers[i]!.family_name,
      email:        passengers[i]!.email,
      phone_number: passengers[i]!.phone_number,
      born_on:      passengers[i]!.born_on,
      gender:       passengers[i]!.gender,
      title:        passengers[i]!.title,
    }));

    // Not retried — same reasoning as paymentIntents.create above: retrying an order-create
    // after a lost response risks a duplicate booking if the first attempt actually succeeded.
    const order = await this.duffel.orders.create({
      selected_offers: [offer_id],
      passengers: orderTravellers,
      payments: [{
        type:     'balance',
        amount:   offer.data.total_amount,
        currency: offer.data.total_currency,
      }],
      type:     'instant',
      metadata: { payment_intent_id },
    });

    const o = order.data;

    return {
      order_id:          o.id,
      booking_reference: o.booking_reference ?? null,
      total_amount:      o.total_amount,
      total_currency:    o.total_currency,
      documents:         o.documents?.map((d) => d.unique_identifier) ?? [],
      origin,
      destination,
      departure_date,
      return_date,
      airline:           outbound.airline,
      flight_number:     outbound.flight_number,
      dep:               outbound.dep,
      arr:               outbound.arr,
      dur:               outbound.dur,
      ...(inbound ? { return_dep: inbound.dep, return_arr: inbound.arr, return_dur: inbound.dur } : {}),
    };
  }

  /** Airport autocomplete for the wizard's pickers. Flattens city-type results' nested
   *  airports[] into individual entries rather than filtering to type==='airport' only —
   *  Duffel often ranks a city above its own airports, which would drop the disambiguation this exists for. */
  async suggestAirports(query: string): Promise<AirportSuggestion[]> {
    const res = await withDuffelRetry(() => this.duffel.suggestions.list({ name: query }));
    const airports: AirportSuggestion[] = [];

    for (const place of res.data) {
      if (place.type === 'airport' && place.iata_code) {
        airports.push({
          iataCode: place.iata_code,
          name: place.name,
          cityName: place.city_name,
          countryName: place.country_name,
        });
      } else if (place.type === 'city' && place.airports) {
        for (const a of place.airports) {
          if (a.iata_code) {
            airports.push({
              iataCode: a.iata_code,
              name: a.name,
              cityName: a.city_name,
              countryName: place.country_name,
            });
          }
        }
      }
    }

    return airports.slice(0, 10);
  }
}

export function createFlightProvider(): FlightProvider {
  return config.useMockFlights ? new MockFlightProvider() : new RealFlightProvider();
}
