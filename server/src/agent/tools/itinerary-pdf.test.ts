import { randomUUID } from 'crypto';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db', async () => {
  const { createTestDb } = await import('../../test-utils/create-test-db');
  const testDb = createTestDb();
  return { getDb: () => testDb };
});

import { makeGenerateItineraryPdfTool } from './itinerary-pdf';
import { FileService } from '../../service/file/file-service';
import { TripService } from '../../service/trip/trip-service';
import { FlightBookingRepository } from '../../repositories/flight-booking-repository';
import { StayBookingRepository } from '../../repositories/stay-booking-repository';

function stubFileService(): FileService {
  return { writeFile: vi.fn() } as unknown as FileService;
}

describe('generate_itinerary_pdf tool', () => {
  it("names the file after the trip's own name and its earliest booking's year/month when one exists", async () => {
    const tripService = new TripService(randomUUID());
    const trip = tripService.createTrip('Paris Trip');

    new FlightBookingRepository().create({
      order_id: randomUUID(), booking_reference: 'ABC123', offer_id: 'offer_1', trip_id: trip.id,
      origin: 'DUB', destination: 'CDG', departure_date: '2026-09-10', return_date: null,
      airline: 'Aer Lingus', flight_number: 'EI600', dep: '10:00', arr: '12:00', dur: '2h 00m',
      return_dep: null, return_arr: null, return_dur: null,
      passengers: [{ given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com', phone_number: '+353861234567', born_on: '1990-01-01', gender: 'f', title: 'ms' }],
      total_amount: '199.99', total_currency: 'EUR', documents: [], payment_intent_id: 'pi_1',
    });

    const fileService = stubFileService();
    const tool = makeGenerateItineraryPdfTool(trip.id, fileService, tripService);

    const result = JSON.parse(await tool.run({}));

    expect(result.filename).toBe('itinerary_Paris_Trip_2026_09.pdf');
    expect(result.url).toBe(`/api/chatbot/files/${encodeURIComponent('itinerary_Paris_Trip_2026_09.pdf')}`);
    expect(fileService.writeFile).toHaveBeenCalledWith('itinerary_Paris_Trip_2026_09.pdf', expect.any(Buffer));
  });

  it('sanitizes a trip name with spaces/punctuation into a filesystem-safe, underscored name', async () => {
    const tripService = new TripService(randomUUID());
    const trip = tripService.createTrip("Ada's Trip, Paris!");

    new StayBookingRepository().create({
      duffel_booking_id: randomUUID(), reference: 'STAYREF1', trip_id: trip.id,
      accommodation_name: 'Hotel Ritz', check_in_date: '2026-03-05', check_out_date: '2026-03-10',
      guests: [{ given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com', phone_number: '+353861234567', born_on: '1990-01-01', gender: 'f', title: 'ms' }],
      total_amount: '300.00', total_currency: 'EUR', status: 'confirmed',
    });

    const fileService = stubFileService();
    const tool = makeGenerateItineraryPdfTool(trip.id, fileService, tripService);

    const result = JSON.parse(await tool.run({}));

    expect(result.filename).toBe('itinerary_Adas_Trip_Paris_2026_03.pdf');
  });

  it('falls back to a timestamped filename when the trip has no bookings yet', async () => {
    const tripService = new TripService(randomUUID());
    const trip = tripService.createTrip('Empty Trip');

    const fileService = stubFileService();
    const tool = makeGenerateItineraryPdfTool(trip.id, fileService, tripService);

    const result = JSON.parse(await tool.run({}));

    expect(result.filename).toMatch(/^itinerary-\d{8}-\d{6}\.pdf$/);
  });
});
