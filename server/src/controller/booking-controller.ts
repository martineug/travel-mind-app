import { Router, Request, Response } from 'express';
import { requireUser } from './session';
import { confirmBooking, initiateFlightBooking, BookingError, Traveller } from '../service/flight/flight-service';
import { bookCar } from '../service/car/car-service';
import { bookStay } from '../service/stay/stay-service';
import { listTravellers, saveTravellers, selfTraveller } from '../service/traveller/traveller-service';
import { ChatMessageRepository } from '../repositories/chat-message-repository';
import { UserProfileRepository } from '../repositories/user-profile-repository';
import { createLogger } from '../logger';

const router = Router();
const logger = createLogger('booking-controller');
const userProfileRepository = new UserProfileRepository();

function isCompleteTraveller(p: unknown): p is Traveller {
  const fields = ['given_name', 'family_name', 'email', 'phone_number', 'born_on', 'gender', 'title'];
  return !!p && typeof p === 'object' && fields.every(f => !!(p as Record<string, unknown>)[f]);
}

// GET /api/travellers — account holder + every prior traveller, for the picker. Composed
// rather than stored — the account holder always comes from user_profiles.
router.get('/travellers', (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  logger.traceCall('GET /travellers', {}, { userId: user.userId });

  const profile = userProfileRepository.findByUserId(user.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const result = { self: selfTraveller(profile), saved: listTravellers(user.userId) };
  res.json(result);
  logger.traceRet('GET /travellers', { savedCount: result.saved.length });
});

// POST .../flights/bookings/initiate — payment intent for a chosen offer + explicit
// passengers. Not routed through the agent, so traveller/payment data never touch the LLM.
router.post('/flights/bookings/initiate', async (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const { offer_id, passengers, chat_id, flight_label } = req.body as {
    offer_id?: string; passengers?: unknown; chat_id?: string; flight_label?: string;
  };
  logger.traceCall('POST /flights/bookings/initiate', { offer_id, chat_id }, { userId: user.userId });

  if (!offer_id || !Array.isArray(passengers) || passengers.length === 0 || !passengers.every(isCompleteTraveller)) {
    return res.status(400).json({ error: 'offer_id and a non-empty passengers array of complete passenger details are required' });
  }

  try {
    const result = await initiateFlightBooking({ offer_id, passengers });

    // Remember anyone who isn't the account holder, so the next booking offers them.
    saveTravellers(user.userId, passengers);

    // Mirror the exchange into the chat so the transcript stays coherent and chat-panel's reload-restore path re-opens the payment sheet unchanged.
    if (chat_id) {
      const names = passengers.map(p => `${p.given_name} ${p.family_name}`).join(', ');
      const repo = new ChatMessageRepository(user.userId);
      repo.createMessage(chat_id, 'user', `Book the ${flight_label || 'selected'} flight for ${names}`);
      repo.createMessage(chat_id, 'assistant', JSON.stringify({ ...result, message: 'Ready to pay!' }));
    }

    res.json(result);
    logger.traceRet('POST /flights/bookings/initiate', { offer_id, travellerCount: passengers.length });
  } catch (err) {
    if (err instanceof BookingError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    logger.error({ offer_id, err }, 'initiate-booking failed');
    return res.status(502).json({ error: `Could not start the booking: ${err}` });
  }
});

// POST /api/stays/bookings — books explicitly chosen guests, lead guest first (becomes the booking's contact) — same client-driven pattern as car/flight bookings.
router.post('/stays/bookings', async (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const { rate_id, check_in_date, check_out_date, guests, chat_id, trip_id, stay_label } = req.body as {
    rate_id?: string; check_in_date?: string; check_out_date?: string; guests?: unknown;
    chat_id?: string; trip_id?: string; stay_label?: string;
  };
  logger.traceCall('POST /stays/bookings', { rate_id, check_in_date, check_out_date, chat_id }, { userId: user.userId });

  if (!rate_id || !check_in_date || !check_out_date
    || !Array.isArray(guests) || guests.length === 0 || !guests.every(isCompleteTraveller)) {
    return res.status(400).json({ error: 'rate_id, check_in_date, check_out_date, and a non-empty guests array of complete guest details are required' });
  }
  if (!trip_id) {
    return res.status(400).json({ error: 'trip_id is required' });
  }

  try {
    const result = await bookStay({ rate_id, check_in_date, check_out_date, guests }, trip_id);

    saveTravellers(user.userId, guests);

    if (chat_id) {
      const names = guests.map(g => `${g.given_name} ${g.family_name}`).join(', ');
      const repo = new ChatMessageRepository(user.userId);
      repo.createMessage(chat_id, 'user', `Book ${stay_label || 'the selected stay'} for ${names}`);
      repo.createMessage(chat_id, 'assistant', JSON.stringify({
        action: 'chat',
        message: `Your stay at ${result.accommodation_name} is booked for ${names}! Booking reference: ${result.booking_reference}. Check-in ${result.check_in}, check-out ${result.check_out}. Total: ${result.total} ${result.currency}.`,
      }));
    }

    res.json(result);
    logger.traceRet('POST /stays/bookings', { rate_id, booking_reference: result.booking_reference });
  } catch (err) {
    logger.error({ rate_id, err }, 'stay booking failed');
    return res.status(502).json({ error: `Could not book that stay: ${err}` });
  }
});

// POST /api/cars/bookings — books an explicitly chosen driver, same client-driven pattern as flights but no payment step, so this completes outright.
router.post('/cars/bookings', async (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const { rate_id, pickup_date, dropoff_date, driver, chat_id, trip_id, car_label } = req.body as {
    rate_id?: string; pickup_date?: string; dropoff_date?: string; driver?: unknown;
    chat_id?: string; trip_id?: string; car_label?: string;
  };
  logger.traceCall('POST /cars/bookings', { rate_id, pickup_date, dropoff_date, chat_id }, { userId: user.userId });

  if (!rate_id || !pickup_date || !dropoff_date || !isCompleteTraveller(driver)) {
    return res.status(400).json({ error: 'rate_id, pickup_date, dropoff_date, and complete driver details are required' });
  }
  if (!trip_id) {
    return res.status(400).json({ error: 'trip_id is required' });
  }

  try {
    const result = await bookCar({
      rate_id,
      pickup_date,
      dropoff_date,
      given_name:    driver.given_name,
      family_name:   driver.family_name,
      email:         driver.email,
      phone_number:  driver.phone_number,
      date_of_birth: driver.born_on,
    }, trip_id);

    saveTravellers(user.userId, [driver]);

    if (chat_id) {
      const name = `${driver.given_name} ${driver.family_name}`;
      const repo = new ChatMessageRepository(user.userId);
      repo.createMessage(chat_id, 'user', `Book the ${car_label || 'selected'} car with ${name} driving`);
      repo.createMessage(chat_id, 'assistant', JSON.stringify({
        action: 'chat',
        message: `Your ${result.car_name} from ${result.supplier_name} is booked for ${name}! Booking reference: ${result.booking_reference}. Pick-up ${result.pickup_date}, drop-off ${result.dropoff_date}. Total: ${result.total} ${result.currency}.`,
      }));
    }

    res.json(result);
    logger.traceRet('POST /cars/bookings', { rate_id, booking_reference: result.booking_reference });
  } catch (err) {
    logger.error({ rate_id, err }, 'car booking failed');
    return res.status(502).json({ error: `Could not book that car: ${err}` });
  }
});

// POST /api/flights/bookings/confirm
router.post('/flights/bookings/confirm', async (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const { offer_id, passengers, payment_intent_id, trip_id, chat_id }: {
    offer_id:           string;
    passengers:         Traveller[];
    payment_intent_id:  string;
    trip_id:            string;
    chat_id:            string;
  } = req.body;

  logger.traceCall('POST /flights/bookings/confirm', { offer_id, trip_id, chat_id }, { userId: user.userId, travellerCount: passengers?.length });

  if (!offer_id || !Array.isArray(passengers) || passengers.length === 0 || !payment_intent_id) {
    return res.status(400).json({ error: 'offer_id, a non-empty passengers array, and payment_intent_id are required' });
  }

  try {
    const result = await confirmBooking(offer_id, passengers, payment_intent_id, trip_id ?? '', chat_id ?? '', user.userId);
    logger.traceRet('POST /flights/bookings/confirm', { order_id: result.order_id, booking_reference: result.booking_reference });
    return res.json(result);
  } catch (err) {
    if (err instanceof BookingError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    throw err;
  }
});

export default router;
