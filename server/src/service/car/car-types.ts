export interface CarSearchParams {
  pickup_latitude:         number;
  pickup_longitude:        number;
  dropoff_latitude:        number;
  dropoff_longitude:       number;
  pickup_date:             string;
  pickup_time:             string;
  dropoff_date:            string;
  dropoff_time:            string;
  driver_age?:             number;
  residence_country_code?: string;
}

export interface CarOffer {
  id: string;
  supplier: string;
  car_name: string;
  category: string;
  transmission: string;
  passengers: number | null;
  pickup_location: string;
  dropoff_location: string;
  pickup_date: string;
  dropoff_date: string;
  price: number;
  cur: string;
  _rate_id: string;
}

export interface CarBookParams {
  rate_id:       string;
  pickup_date:   string;
  dropoff_date:  string;
  given_name:    string;
  family_name:   string;
  email:         string;
  phone_number:  string;
  date_of_birth: string;
}

export interface CarBookingResult {
  booking_reference: string | null;
  status:             string;
  supplier_name:      string;
  car_name:           string;
  pickup_date:        string;
  dropoff_date:       string;
  total:              string;
  currency:           string;
}
