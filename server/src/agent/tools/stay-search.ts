import { Tool } from '../tool';
import { searchStays, StaySearchParams } from '../../service/stay/stay-service';

export const staySearchTool = new Tool(
  'stay_search',
  'Search for available stays (hotels, apartments, etc.) near a location for given check-in/check-out dates. Returns a list of accommodations with prices and ratings.',
  {
    latitude:       { type: 'number', description: 'Latitude of the search location in decimal degrees, e.g. 48.8566 for Paris' },
    longitude:      { type: 'number', description: 'Longitude of the search location in decimal degrees, e.g. 2.3522 for Paris' },
    check_in_date:  { type: 'string', description: 'Date in YYYY-MM-DD format' },
    check_out_date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
    adults:         { type: 'number', description: 'Number of adult guests (default 1)' },
    rooms:          { type: 'number', description: 'Number of rooms (default 1)' },
    max_price_per_night: { type: 'number', description: 'Optional: only return stays at or below this price per night, in the local currency. Omit if the user has not specified a budget.' },
    min_rating:          { type: 'number', description: 'Optional: only return stays with a star rating at or above this value (1-5). Omit if the user has not specified a minimum rating.' },
  },
  async (args) => JSON.stringify(await searchStays(args as StaySearchParams)),
);
