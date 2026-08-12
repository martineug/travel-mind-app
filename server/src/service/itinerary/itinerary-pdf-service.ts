import PDFDocument from 'pdfkit';
import { FlightBookingRepository, FlightBookingSummary } from '../../repositories/flight-booking-repository';
import { StayBookingRepository, StayBookingSummary } from '../../repositories/stay-booking-repository';
import { CarBookingRepository, CarBookingSummary } from '../../repositories/car-booking-repository';

function writeFlightSection(doc: PDFKit.PDFDocument, flights: FlightBookingSummary[]): void {
  if (!flights.length) return;

  doc.fontSize(16).text('Flights');
  doc.moveDown(0.5);

  for (const f of flights) {
    // "->" not "→" — pdfkit's standard fonts use WinAnsiEncoding (~Windows-1252), which has no
    // arrow glyph at all, so the Unicode arrow renders as garbled bytes instead of a missing box.
    doc.fontSize(12).text(`${f.origin} -> ${f.destination}`);
    doc.fontSize(10).text(`${f.departure_date}${f.return_date ? ` – ${f.return_date}` : ''}`);
    if (f.airline || f.flight_number) doc.text(`${f.airline ?? ''} ${f.flight_number ?? ''}`.trim());
    doc.text(`Reference: ${f.booking_reference ?? '—'}`);
    doc.text(`Total: ${f.total_amount} ${f.total_currency}`);
    doc.moveDown();
  }
}

function writeStaySection(doc: PDFKit.PDFDocument, stays: StayBookingSummary[]): void {
  if (!stays.length) return;

  doc.fontSize(16).text('Stays');
  doc.moveDown(0.5);

  for (const s of stays) {
    doc.fontSize(12).text(s.accommodation_name);
    doc.fontSize(10).text(`${s.check_in_date} – ${s.check_out_date}`);
    doc.text(`Reference: ${s.reference ?? '—'}`);
    doc.text(`Total: ${s.total_amount} ${s.total_currency}`);
    doc.moveDown();
  }
}

function writeCarSection(doc: PDFKit.PDFDocument, cars: CarBookingSummary[]): void {
  if (!cars.length) return;

  doc.fontSize(16).text('Cars');
  doc.moveDown(0.5);

  for (const c of cars) {
    doc.fontSize(12).text(`${c.car_name} (${c.supplier_name})`);
    doc.fontSize(10).text(`${c.pickup_date} – ${c.dropoff_date}`);
    doc.text(`Driver: ${c.driver_given_name} ${c.driver_family_name}`);
    doc.text(`Reference: ${c.reference ?? '—'}`);
    doc.text(`Total: ${c.total_amount} ${c.total_currency}`);
    doc.moveDown();
  }
}

/** The date the generated itinerary file gets named after (see generate_itinerary_pdf's tool,
 *  which pairs this with the trip's own name for the "place" part). Earliest date across every
 *  booking of any type — null when the trip has no bookings yet at all (caller falls back to a
 *  timestamped name). */
export function findEarliestBookingDate(tripId: string): Date | null {
  const flights = new FlightBookingRepository().findByTripId(tripId);
  const stays = new StayBookingRepository().findByTripId(tripId);
  const cars = new CarBookingRepository().findByTripId(tripId);

  const dates = [
    ...flights.map(f => new Date(f.departure_date)),
    ...stays.map(s => new Date(s.check_in_date)),
    ...cars.map(c => new Date(c.pickup_date)),
  ];

  return dates.length === 0 ? null : dates.reduce((earliest, d) => (d < earliest ? d : earliest));
}

/** Renders a PDF summary of a trip's bookings straight from the same repositories the
 *  itinerary panel reads from — in-memory only, no temp files. */
export function buildItineraryPdf(tripId: string): Promise<Buffer> {
  const flights = new FlightBookingRepository().findByTripId(tripId);
  const stays = new StayBookingRepository().findByTripId(tripId);
  const cars = new CarBookingRepository().findByTripId(tripId);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('Trip Itinerary', { align: 'center' });
    doc.moveDown();

    if (flights.length + stays.length + cars.length === 0) {
      doc.fontSize(12).text('No bookings yet for this trip.');
    } else {
      writeFlightSection(doc, flights);
      writeStaySection(doc, stays);
      writeCarSection(doc, cars);
    }

    doc.end();
  });
}
