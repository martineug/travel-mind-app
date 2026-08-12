import { createLogger } from '../../logger';
import { UserTripRepository } from '../../repositories/user-trip-repository';
import { UserProfileRepository } from '../../repositories/user-profile-repository';
import { UserTrip } from '../../model/user-trip';

export class TripError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const logger = createLogger('trip-service');
const userProfileRepository = new UserProfileRepository();

export class TripService {
  private userTripRepository: UserTripRepository;

  constructor(private readonly userId: string) {
    this.userTripRepository = new UserTripRepository(userId);
  }

  createTrip(tripName: string): UserTrip {
    logger.debugInfoCall('createTrip', { tripName }, { userId: this.userId });
    const trip = this.userTripRepository.create(tripName);
    logger.debugInfoRet('createTrip', { tripId: trip.id });
    return trip;
  }

  getTrip(tripId: string): UserTrip | null {
    return this.userTripRepository.findById(tripId);
  }

  getTrips(): UserTrip[] {
    logger.debugInfoCall('getTrips', {}, { userId: this.userId });
    const trips = this.userTripRepository.findByUserId();
    logger.debugInfoRet('getTrips', { count: trips.length });
    return trips;
  }

  renameTrip(id: string, tripName: string): UserTrip | null {
    logger.debugInfoCall('renameTrip', { tripId: id, tripName });
    const trip = this.userTripRepository.update(id, tripName);
    logger.debugInfoRet('renameTrip', { found: !!trip });
    return trip;
  }

  getCurrentTripId(): string {
    logger.debugInfoCall('getCurrentTripId', {}, { userId: this.userId });

    const profile = userProfileRepository.findByUserId(this.userId);

    if (profile?.currentTripId) {
      logger.debugInfoRet('getCurrentTripId', { tripId: profile.currentTripId, source: 'profile' });
      return profile.currentTripId;
    }

    const trips = this.getTrips();

    if (trips[0]) {
      userProfileRepository.updateCurrentTrip(this.userId, trips[0].id);
      logger.debugInfoRet('getCurrentTripId', { tripId: trips[0].id, source: 'first_trip' });
      return trips[0].id;
    }

    const trip = this.createDefaultTrip();
    logger.debugInfoRet('getCurrentTripId', { tripId: trip.id, source: 'created' });
    return trip.id;
  }

  /** Deletes a trip. If it was the user's last, a fresh default trip is created and made
   *  current (returned as `recreatedTrip`) so the user is never left with zero trips —
   *  mirrors getCurrentTripId()'s own fallback for new sign-ups. */
  deleteTrip(tripId: string): UserTrip | null {
    logger.debugInfoCall('deleteTrip', { tripId }, { userId: this.userId });

    const trips = this.getTrips();

    if (!trips.find(t => t.id === tripId)) {
      logger.error({ tripId }, 'deleteTrip rejected: trip not found');
      throw new TripError(`Trip not found: ${tripId}`, 404);
    }

    const remaining = trips.filter(t => t.id !== tripId);
    let recreatedTrip: UserTrip | null = null;

    if (remaining.length === 0) {
      // Deleting the last trip — recreate a default and point current_trip_id at it before deleting, to satisfy the FK constraint.
      recreatedTrip = this.createDefaultTrip();
    } else {
      const profile = userProfileRepository.findByUserId(this.userId);
      if (profile?.currentTripId === tripId) {
        userProfileRepository.updateCurrentTrip(this.userId, remaining[0]!.id);
      }
    }

    this.userTripRepository.delete(tripId);
    logger.debugInfoRet('deleteTrip', { tripId, recreatedTripId: recreatedTrip?.id ?? null });
    return recreatedTrip;
  }

  private createDefaultTrip(): UserTrip {
    const trip = this.createTrip('My First Trip');
    userProfileRepository.updateCurrentTrip(this.userId, trip.id);
    return trip;
  }

  switchTrip(tripId: string): UserTrip {
    logger.debugInfoCall('switchTrip', { tripId }, { userId: this.userId });

    const trip = this.userTripRepository.findById(tripId);

    if (!trip) {
      logger.error({ tripId }, 'switchTrip rejected: trip not found');
      throw new TripError(`Trip not found: ${tripId}`, 404);
    }

    userProfileRepository.updateCurrentTrip(this.userId, tripId);

    logger.debugInfoRet('switchTrip', { tripId: trip.id });
    return trip;
  }
}
