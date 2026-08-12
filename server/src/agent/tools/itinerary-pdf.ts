import { Tool } from '../tool';
import { FileService } from '../../service/file/file-service';
import { TripService } from '../../service/trip/trip-service';
import { buildItineraryPdf, findEarliestBookingDate } from '../../service/itinerary/itinerary-pdf-service';
import { fmtTimestampForFilename } from '../../utils/time-date';

/** Filesystem-safe version of the trip's name — spaces become underscores (per the
 *  itinerary_<trip_name>_<year>_<month> naming scheme), anything else unsafe is stripped rather
 *  than preserved (e.g. accents, apostrophes, commas). Falls back to 'trip' if nothing
 *  alphanumeric survives. */
function sanitizeForFilename(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned || 'trip';
}

/** Returns a raw JSON string (not prose) — chatbot-service.ts's applyAuthoritativeFile()
 *  parses this to attach a real download link, since the model can't be trusted to echo a
 *  URL verbatim (same reasoning as applyAuthoritativeSearch for flight/stay/car results). */
export function makeGenerateItineraryPdfTool(tripId: string, fileService: FileService, tripService: TripService): Tool {
  return new Tool(
    'generate_itinerary_pdf',
    "Generate a PDF summary of the user's current trip itinerary (flights, stays, cars) and save it to their files. Use this when the user asks for a PDF, printout, or downloadable summary of their trip.",
    {},
    async () => {
      const pdf = await buildItineraryPdf(tripId);

      // Named after the trip itself plus its earliest booking's date (resolved fresh here, not
      // at tool-construction time, in case the trip's been renamed since) — falls back to a
      // timestamp only when there's nothing booked yet to derive a date from.
      const trip = tripService.getTrip(tripId);
      const earliestDate = findEarliestBookingDate(tripId);
      const month = earliestDate ? String(earliestDate.getMonth() + 1).padStart(2, '0') : null;
      const filename = trip && earliestDate
        ? `itinerary_${sanitizeForFilename(trip.tripName)}_${earliestDate.getFullYear()}_${month}.pdf`
        : `itinerary-${fmtTimestampForFilename()}.pdf`;

      fileService.writeFile(filename, pdf);
      return JSON.stringify({ filename, url: `/api/chatbot/files/${encodeURIComponent(filename)}` });
    },
  );
}
