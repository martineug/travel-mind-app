import { TravellerProfileRepository } from '../../repositories/traveller-profile-repository';
import { UserProfileRepository } from '../../repositories/user-profile-repository';
import { TravellerProfile } from '../../model/traveller-profile';
import { UserProfile } from '../../model/user-profile';
import { Traveller } from '../flight/flight-types';
import { createLogger } from '../../logger';

const logger = createLogger('traveller-service');

/** The account holder as a bookable traveller — composed from user_profiles on demand so editing the account can't leave a stale copy behind. */
export function selfTraveller(profile: UserProfile): Traveller {
  return {
    given_name:   profile.firstName,
    family_name:  profile.lastName,
    email:        profile.emailAddress,
    phone_number: profile.phoneNumber,
    born_on:      profile.bornOn,
    gender:       profile.gender as Traveller['gender'],
    title:        profile.title as Traveller['title'],
  };
}

export function listTravellers(userId: string): TravellerProfile[] {
  return new TravellerProfileRepository(userId).findByUserId();
}

/** Remembers every traveller from a booking except the account holder, so the next booking
 *  can offer them instead of asking again. Best-effort — a failure here is logged, not thrown, never failing a booking over a convenience feature. */
export function saveTravellers(userId: string, passengers: Traveller[]): void {
  const repository = new TravellerProfileRepository(userId);
  const profile = new UserProfileRepository().findByUserId(userId);
  const self = profile ? selfTraveller(profile) : null;
  const isSelf = (p: Traveller) =>
    !!self && p.given_name === self.given_name && p.family_name === self.family_name && p.born_on === self.born_on;

  for (const p of passengers) {
    if (isSelf(p)) continue;
    try {
      repository.upsert({
        givenName:   p.given_name,
        familyName:  p.family_name,
        email:       p.email,
        phoneNumber: p.phone_number,
        bornOn:      p.born_on,
        gender:      p.gender,
        title:       p.title,
      });
    } catch (err) {
      logger.error({ err, userId }, 'saveTravellers: could not save a traveller profile');
    }
  }
}
