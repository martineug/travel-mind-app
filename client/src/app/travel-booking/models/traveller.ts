export interface Traveller {
  given_name:   string;
  family_name:  string;
  email:        string;
  phone_number: string;
  born_on:      string;
  gender:       string;
  title:        string;
}

/** A traveller the user has booked for before, offered for re-selection at booking time. */
export interface TravellerProfile {
  id: string;
  givenName: string;
  familyName: string;
  email: string;
  phoneNumber: string;
  bornOn: string;
  gender: string;
  title: string;
}

export interface TravellersResponse {
  self: Traveller;
  saved: TravellerProfile[];
}
