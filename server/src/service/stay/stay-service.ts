import { createStaysProvider } from '../../providers/stay-provider';
import { createLogger } from '../../logger';
import { StayBookingRepository } from '../../repositories/stay-booking-repository';
import { StaySearchParams, StayOffer, StayBookParams, StayBookingResult } from './stay-types';

// Re-export types consumed by tools and controllers
export type { StaySearchParams, StayOffer, StayBookParams, StayBookingResult };

const logger = createLogger('stay-service');
const provider = createStaysProvider();
const stayBookingRepository = new StayBookingRepository();

export async function searchStays(params: StaySearchParams): Promise<StayOffer[]> {
  logger.debugInfoCall('searchStays',
    { check_in: params.check_in_date, check_out: params.check_out_date },
    { latitude: params.latitude, longitude: params.longitude, max_price_per_night: params.max_price_per_night, min_rating: params.min_rating },
  );

  const searchRes = await provider.search(params);
  const results = searchRes.results.slice(0, 10);

  const offers = results.map((r, idx) => {
    const acc = r.accommodation;

    return {
      id: `s${idx + 1}`,
      name: acc.name,
      rating: acc.rating,
      review_score: acc.review_score,
      city: acc.location.address.city_name,
      address: acc.location.address.line_one,
      photo: acc.photos?.[0]?.url ?? null,
      price: parseFloat(r.cheapest_rate_total_amount),
      cur: r.cheapest_rate_currency,
      check_in: r.check_in_date,
      check_out: r.check_out_date,
      amenities: (acc.amenities ?? []).slice(0, 4).map(a => a.type),
      _result_id: r.id,
      _rate_id: acc.rooms[0]?.rates[0]?.id ?? null,
      _adults: params.adults ?? 1,
    };
  });

  // Duffel's stays.search has no budget/rating filter params — applied as post-search
  // filtering. Unknown ratings (frequently null) are kept, not dropped — no data isn't evidence of failing a minimum.
  const filtered = offers.filter(o =>
    (params.max_price_per_night === undefined || o.price <= params.max_price_per_night)
    && (params.min_rating === undefined || o.rating === null || o.rating >= params.min_rating),
  );

  logger.debugInfoRet('searchStays', { count: filtered.length, filteredOut: offers.length - filtered.length });
  return filtered;
}

export async function bookStay(params: StayBookParams, tripId: string): Promise<StayBookingResult> {
  logger.debugInfoCall('bookStay', { rate_id: params.rate_id, tripId, guestCount: params.guests.length }, {});

  const quote = await provider.createQuote(params.rate_id, params.check_in_date, params.check_out_date);

  // Duffel records only a name per guest; email/phone come from the lead guest (first picked), the booking's single contact.
  const lead = params.guests[0]!;
  const payload = {
    quote_id: quote.id,
    guests: params.guests.map(g => ({ given_name: g.given_name, family_name: g.family_name })),
    email: lead.email,
    phone_number: lead.phone_number,
  };

  const booking = await provider.createBooking(payload);

  stayBookingRepository.create({
    duffel_booking_id: booking.id,
    reference: booking.reference,
    trip_id: tripId,
    accommodation_name: booking.accommodation.name,
    check_in_date: booking.check_in_date,
    check_out_date: booking.check_out_date,
    guests: params.guests,
    total_amount: quote.total_amount,
    total_currency: quote.total_currency,
    status: booking.status,
  });

  const result = {
    booking_reference: booking.reference,
    status: booking.status,
    accommodation_name: booking.accommodation.name,
    check_in: booking.check_in_date,
    check_out: booking.check_out_date,
    total: quote.total_amount,
    currency: quote.total_currency,
  };

  logger.debugInfoRet('bookStay', { booking_reference: result.booking_reference, status: result.status, total: result.total });
  return result;
}
