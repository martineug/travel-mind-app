import { Tool } from '../tool';
import { searchCars, CarSearchParams } from '../../service/car/car-service';

export const carSearchTool = new Tool(
  'car_search',
  'Search for available rental cars at a pickup/dropoff location for given pickup/dropoff dates and times. Returns a list of cars with suppliers and prices.',
  {
    pickup_latitude:         { type: 'number', description: 'Latitude of the pickup location in decimal degrees, e.g. 48.8566 for Paris' },
    pickup_longitude:        { type: 'number', description: 'Longitude of the pickup location in decimal degrees, e.g. 2.3522 for Paris' },
    dropoff_latitude:        { type: 'number', description: 'Latitude of the dropoff location in decimal degrees. Same as pickup if not specified by the user.' },
    dropoff_longitude:       { type: 'number', description: 'Longitude of the dropoff location in decimal degrees. Same as pickup if not specified by the user.' },
    pickup_date:             { type: 'string', description: 'Pickup date in YYYY-MM-DD format' },
    pickup_time:             { type: 'string', description: 'Pickup time in HH:MM 24-hour format, e.g. 10:00' },
    dropoff_date:            { type: 'string', description: 'Dropoff date in YYYY-MM-DD format' },
    dropoff_time:            { type: 'string', description: 'Dropoff time in HH:MM 24-hour format, e.g. 10:00' },
    driver_age:              { type: 'number', description: "Driver's age (default 30)" },
    residence_country_code:  { type: 'string', description: "Driver's country of residence as an ISO 3166-1 alpha-2 code, e.g. IE (default IE)" },
  },
  async (args) => JSON.stringify(await searchCars(args as CarSearchParams)),
);
