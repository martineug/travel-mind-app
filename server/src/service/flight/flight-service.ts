import { createLogger } from '../../logger';
import { FlightBookingRepository } from '../../repositories/flight-booking-repository';
import { ChatMessageRepository } from '../../repositories/chat-message-repository';
import { FlightSearchParams, FlightOffer, FlightBookParams, FlightBookingResult, Traveller, ConfirmBookingResult, AirportSuggestion } from './flight-types';
import { createFlightProvider, isTravellerCountMismatch } from '../../providers/flight-provider';

// Re-export types consumed by tools and controllers
export type { FlightSearchParams, FlightOffer, FlightBookParams, FlightBookingResult, Traveller, ConfirmBookingResult, AirportSuggestion };

const logger = createLogger('flight-service');
const provider = createFlightProvider();
const bookingRepository = new FlightBookingRepository();

export class BookingError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function searchFlights(params: FlightSearchParams): Promise<FlightOffer[]> {
  logger.debugInfoCall('searchFlights',
    { origin: params.origin, destination: params.destination, date: params.departure_date },
    { adults: params.adults ?? 1, cabin: params.cabin_class ?? 'economy' },
  );
  const results = await provider.searchFlights(params);
  logger.debugInfoRet('searchFlights', { count: results.length });
  return results;
}

export async function suggestAirports(query: string): Promise<AirportSuggestion[]> {
  logger.debugInfoCall('suggestAirports', { query }, {});
  const results = await provider.suggestAirports(query);
  logger.debugInfoRet('suggestAirports', { query, count: results.length });
  return results;
}

export async function initiateFlightBooking(params: FlightBookParams): Promise<FlightBookingResult> {
  logger.debugInfoCall('initiateFlightBooking', { offer_id: params.offer_id, travellerCount: params.passengers.length }, {});
  const result = await provider.initiateFlightBooking(params);
  logger.debugInfoRet('initiateFlightBooking',
    { offer_id: result.offer_id, total: result.total, currency: result.currency, travellerCount: result.passengers.length },
    { payment_intent_id: result.payment_intent_id },
  );
  return result;
}

export async function confirmBooking(
  offer_id: string,
  passengers: Traveller[],
  payment_intent_id: string,
  trip_id: string,
  chat_id: string,
  userId: string,
): Promise<ConfirmBookingResult> {
  logger.debugInfoCall('confirmBooking', { offer_id, payment_intent_id, travellerCount: passengers.length }, {});
  try {
    const orderData = await provider.confirmBooking(offer_id, passengers, payment_intent_id);

    bookingRepository.create({
      order_id:              orderData.order_id,
      booking_reference:     orderData.booking_reference,
      offer_id,
      trip_id,
      origin:                orderData.origin,
      destination:           orderData.destination,
      departure_date:        orderData.departure_date,
      return_date:           orderData.return_date ?? null,
      airline:               orderData.airline,
      flight_number:         orderData.flight_number,
      dep:                   orderData.dep,
      arr:                   orderData.arr,
      dur:                   orderData.dur,
      return_dep:            orderData.return_dep ?? null,
      return_arr:            orderData.return_arr ?? null,
      return_dur:            orderData.return_dur ?? null,
      passengers,
      total_amount:          orderData.total_amount,
      total_currency:        orderData.total_currency,
      documents:             orderData.documents,
      payment_intent_id,
    });

    const confirmResult = {
      order_id:          orderData.order_id,
      booking_reference: orderData.booking_reference,
      total:             `${orderData.total_amount} ${orderData.total_currency}`,
      documents:         orderData.documents,
    };

    // Persist a confirmation so the chat's last message stops being the unpaid "payment" action
    // (chat-panel's loadMessages restores pendingPayment from it). Best-effort — the booking
    // already succeeded above, so a failure here is logged, not thrown, never a 500 for the user.
    try {
      new ChatMessageRepository(userId).createMessage(chat_id, 'assistant', JSON.stringify({
        action: 'chat',
        message: `Your flight is booked for ${formatTravellerNames(passengers)}! Booking reference: ${confirmResult.booking_reference}. Total paid: ${confirmResult.total}. You'll receive your e-ticket(s) at the email(s) provided.`,
      }));
    } catch (err) {
      logger.error({ err, chat_id }, 'confirmBooking: failed to persist confirmation message');
    }

    logger.debugInfoRet('confirmBooking', {
      order_id:          confirmResult.order_id,
      booking_reference: confirmResult.booking_reference,
      total:             confirmResult.total,
    });
    return confirmResult;
  } catch (err: any) {
    // A traveller-count mismatch is a caller/prompt mistake, not a server fault — surface it as a 400, not the generic 500.
    if (isTravellerCountMismatch(err)) {
      logger.error({ offer_id, message: err.message }, 'confirm-booking traveller count mismatch');
      throw new BookingError(err.message, 400);
    }
    const duffelErrors = err?.errors;
    if (duffelErrors) {
      logger.error({ offer_id, duffelErrors }, 'Duffel confirm-booking error');
      throw new BookingError(duffelErrors[0]?.title ?? 'Booking failed', 502, duffelErrors);
    }
    logger.error({ offer_id, err }, 'confirm-booking unexpected error');
    throw new BookingError('An unexpected error occurred during booking', 500);
  }
}

function formatTravellerNames(passengers: Traveller[]): string {
  const names = passengers.map(p => `${p.given_name} ${p.family_name}`);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
