import { Tool } from '../tool';
import { searchFlights, FlightSearchParams } from '../../service/flight/flight-service';

export const flightSearchTool = new Tool(
  'flight_search',
  'Search for available flights between two airports on a given date. Returns a list of offers with prices and itineraries.',
  {
    origin:         { type: 'string', description: 'IATA airport code, e.g. "DUB"' },
    destination:    { type: 'string', description: 'IATA airport code, e.g. "LHR"' },
    departure_date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
    return_date:    { type: 'string', description: 'Return date in YYYY-MM-DD format, if this is a round trip. Omit entirely for a one-way search.' },
    trip_type:      { type: 'string', description: 'One of: "round trip", "one-way". Always pass this explicitly. If "one-way", the search never includes a return leg even if you also happen to pass return_date — one-way always wins.' },
    cabin_class:    { type: 'string', description: 'One of: economy, premium_economy, business, first' },
    adults:         { type: 'number', description: 'Number of adult passengers (default 1)' },
  },
  async (args) => JSON.stringify(await searchFlights(args as FlightSearchParams)),
);
