import { Router, Request, Response } from 'express';
import { requireUser } from './session';
import { TripService, TripError } from '../service/trip/trip-service';
import { FlightBookingRepository } from '../repositories/flight-booking-repository';
import { StayBookingRepository } from '../repositories/stay-booking-repository';
import { CarBookingRepository } from '../repositories/car-booking-repository';
import { createLogger } from '../logger';


const router = Router();
const bookingRepository = new FlightBookingRepository();
const stayBookingRepository = new StayBookingRepository();
const carBookingRepository = new CarBookingRepository();
const logger = createLogger('trip-controller');

// GET /api/trips — list the user's trips
router.get('/trips', (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  logger.traceCall('GET /trips', {}, { userId: user.userId });
  const trips = new TripService(user.userId).getTrips();
  res.json(trips);
  logger.traceRet('GET /trips', { count: trips.length });
});

// POST /api/trips — create a new trip
router.post('/trips', (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const { tripName } = req.body as { tripName?: string };
  logger.traceCall('POST /trips', { tripName }, { userId: user.userId });

  if (!tripName?.trim()) {
    return res.status(400).json({ error: 'tripName is required' });
  }

  const trip = new TripService(user.userId).createTrip(tripName.trim());
  logger.traceRet('POST /trips', { tripId: trip.id });
  return res.status(201).json(trip);
});

// PATCH /api/trips/:tripId — rename a trip
router.patch('/trips/:tripId', (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const { tripId } = req.params as { tripId: string };
  const { tripName } = req.body as { tripName?: string };
  logger.traceCall('PATCH /trips/:tripId', { tripId, tripName }, { userId: user.userId });

  if (!tripName?.trim()) {
    return res.status(400).json({ error: 'tripName is required' });
  }

  const trip = new TripService(user.userId).renameTrip(tripId, tripName.trim());
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  logger.traceRet('PATCH /trips/:tripId', { tripId: trip.id });
  return res.json(trip);
});

// DELETE /api/trips/:tripId — delete a trip
router.delete('/trips/:tripId', (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const { tripId } = req.params as { tripId: string };
  logger.traceCall('DELETE /trips/:tripId', { tripId }, { userId: user.userId });

  try {
    const recreatedTrip = new TripService(user.userId).deleteTrip(tripId);
    logger.traceRet('DELETE /trips/:tripId', { tripId, recreatedTripId: recreatedTrip?.id ?? null });
    return res.json({ recreatedTrip });
  } catch (err) {
    if (err instanceof TripError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

// GET /api/trips/:tripId/bookings/flights — list flight bookings for a trip
router.get('/trips/:tripId/bookings/flights', (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const { tripId } = req.params as { tripId: string };
  logger.traceCall('GET /trips/:tripId/bookings/flights', { tripId }, { userId: user.userId });
  const bookings = bookingRepository.findByTripId(tripId);
  logger.traceRet('GET /trips/:tripId/bookings/flights', { tripId, count: bookings.length });
  return res.json(bookings);
});

// GET /api/trips/:tripId/bookings/stays — list stay bookings for a trip
router.get('/trips/:tripId/bookings/stays', (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const { tripId } = req.params as { tripId: string };
  logger.traceCall('GET /trips/:tripId/bookings/stays', { tripId }, { userId: user.userId });
  const bookings = stayBookingRepository.findByTripId(tripId);
  logger.traceRet('GET /trips/:tripId/bookings/stays', { tripId, count: bookings.length });
  return res.json(bookings);
});

// GET /api/trips/:tripId/bookings/cars — list car bookings for a trip
router.get('/trips/:tripId/bookings/cars', (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const { tripId } = req.params as { tripId: string };
  logger.traceCall('GET /trips/:tripId/bookings/cars', { tripId }, { userId: user.userId });
  const bookings = carBookingRepository.findByTripId(tripId);
  logger.traceRet('GET /trips/:tripId/bookings/cars', { tripId, count: bookings.length });
  return res.json(bookings);
});

export default router;
