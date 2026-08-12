import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../../config';
import { createLogger } from '../../logger';
import { UserProfileRepository } from '../../repositories/user-profile-repository';
import { UserTripRepository } from '../../repositories/user-trip-repository';
import { UserProfile } from '../../model/user-profile';

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '7d';

const logger = createLogger('auth-service');

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface AuthResult {
  user: Omit<UserProfile, 'passwordHash'>;
  token: string;
}

const userProfileRepository = new UserProfileRepository();

/** Traveller identity captured alongside the credentials at registration, so booking never has to ask the account holder for it. */
export interface SignUpTravellerDetails {
  phoneNumber: string;
  bornOn: string;
  gender: string;
  title: string;
}

export async function signUp(
  emailAddress: string,
  password: string,
  firstName: string,
  lastName: string,
  traveller: SignUpTravellerDetails,
): Promise<AuthResult> {
  logger.traceCall('signUp', { emailAddress }, { firstName, lastName });

  if (userProfileRepository.findByEmail(emailAddress)) {
    logger.error({ emailAddress }, 'signUp: account already exists');
    throw new AuthError('An account with this email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const profile = userProfileRepository.create({
    userId: randomUUID(),
    emailAddress,
    firstName,
    lastName,
    passwordHash,
    phoneNumber: traveller.phoneNumber,
    bornOn: traveller.bornOn,
    gender: traveller.gender,
    title: traveller.title,
  });

  new UserTripRepository(profile.userId).create('My First Trip');

  logger.traceRet('signUp', { userId: profile.userId });
  return { user: toPublicProfile(profile), token: createToken(profile.userId) };
}

export async function signIn(emailAddress: string, password: string): Promise<AuthResult> {
  logger.traceCall('signIn', { emailAddress }, {});

  const profile = userProfileRepository.findByEmail(emailAddress);

  if (!profile || !(await bcrypt.compare(password, profile.passwordHash))) {
    logger.error({ emailAddress }, 'signIn: invalid email or password');
    throw new AuthError('Invalid email or password', 401);
  }

  logger.traceRet('signIn', { userId: profile.userId });
  return { user: toPublicProfile(profile), token: createToken(profile.userId) };
}

export function getUserFromToken(token: string): Omit<UserProfile, 'passwordHash'> | null {
  logger.traceCall('getUserFromToken', {}, {});
  try {
    const { userId } = jwt.verify(token, config.JWT_SECRET) as { userId: string };
    const profile = userProfileRepository.findByUserId(userId);
    logger.traceRet('getUserFromToken', { found: !!profile });
    return profile ? toPublicProfile(profile) : null;
  } catch {
    logger.debug({ fn: 'getUserFromToken' }, 'token verification failed');
    return null;
  }
}

function createToken(userId: string): string {
  return jwt.sign({ userId }, config.JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function toPublicProfile(profile: UserProfile): Omit<UserProfile, 'passwordHash'> {
  const { passwordHash, ...publicProfile } = profile;
  return publicProfile;
}
