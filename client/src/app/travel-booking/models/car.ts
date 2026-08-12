export interface Car {
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
  /** Duffel's id for this rate — needed to book it straight from the UI (see bookCar). */
  _rate_id: string;
}

/** Confirmation returned by the client-driven car booking, no payment step */
export interface CarBookingResult {
  booking_reference: string | null;
  status: string;
  supplier_name: string;
  car_name: string;
  pickup_date: string;
  dropoff_date: string;
  total: string;
  currency: string;
}

export interface CarBookingSummary {
  id:                 number;
  reference:          string | null;
  trip_id:            string;
  supplier_name:      string;
  car_name:           string;
  pickup_date:        string;
  dropoff_date:       string;
  driver_given_name:  string;
  driver_family_name: string;
  total_amount:       string;
  total_currency:     string;
  status:             string;
  created_at:         string;
}
