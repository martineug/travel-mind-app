/** A saved additional traveller, offered at booking time so details aren't typed twice — the account holder is composed from user_profiles instead. */
export interface TravellerProfile {
  id: string;
  givenName: string;
  familyName: string;
  email: string;
  phoneNumber: string;
  bornOn: string;
  gender: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}
