export interface UserProfile {
  userId: string;
  emailAddress: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  /** Traveller identity captured at registration — see user_profiles' schema comment. */
  phoneNumber: string;
  bornOn: string;
  gender: string;
  title: string;
  currentTripId: string | null;
  currentSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}
