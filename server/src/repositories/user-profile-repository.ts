import { getDb } from '../db';
import { UserProfile } from '../model/user-profile';

interface UserProfileRow {
  user_id: string;
  email_address: string;
  first_name: string;
  last_name: string;
  password_hash: string;
  phone_number: string;
  born_on: string;
  gender: string;
  title: string;
  current_trip_id: string | null;
  current_session_id: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = 'user_id, email_address, first_name, last_name, password_hash, phone_number, born_on, gender, title, current_trip_id, current_session_id, created_at, updated_at';

export class UserProfileRepository {
  findByUserId(userId: string): UserProfile | null {
    const row = getDb()
      .prepare(`SELECT ${SELECT_COLUMNS} FROM user_profiles WHERE user_id = ?`)
      .get(userId) as UserProfileRow | undefined;

    return row ? this.toProfile(row) : null;
  }

  findByEmail(emailAddress: string): UserProfile | null {
    const row = getDb()
      .prepare(`SELECT ${SELECT_COLUMNS} FROM user_profiles WHERE email_address = ?`)
      .get(emailAddress) as UserProfileRow | undefined;

    return row ? this.toProfile(row) : null;
  }

  create(profile: Omit<UserProfile, 'currentTripId' | 'currentSessionId' | 'createdAt' | 'updatedAt'>): UserProfile {
    const row = getDb()
      .prepare(`
        INSERT INTO user_profiles (user_id, email_address, first_name, last_name, password_hash, phone_number, born_on, gender, title)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING ${SELECT_COLUMNS}
      `)
      .get(
        profile.userId, profile.emailAddress, profile.firstName, profile.lastName, profile.passwordHash,
        profile.phoneNumber, profile.bornOn, profile.gender, profile.title,
      ) as UserProfileRow;

    return this.toProfile(row);
  }

  update(profile: Omit<UserProfile, 'currentTripId' | 'currentSessionId' | 'createdAt' | 'updatedAt'>): UserProfile {
    const row = getDb()
      .prepare(`
        UPDATE user_profiles
        SET email_address = ?, first_name = ?, last_name = ?, password_hash = ?,
            phone_number = ?, born_on = ?, gender = ?, title = ?, updated_at = datetime('now')
        WHERE user_id = ?
        RETURNING ${SELECT_COLUMNS}
      `)
      .get(
        profile.emailAddress, profile.firstName, profile.lastName, profile.passwordHash,
        profile.phoneNumber, profile.bornOn, profile.gender, profile.title, profile.userId,
      ) as UserProfileRow;

    return this.toProfile(row);
  }

  updateCurrentSession(userId: string, sessionId: string): UserProfile | null {
    const row = getDb()
      .prepare(`
        UPDATE user_profiles
        SET current_session_id = ?, updated_at = datetime('now')
        WHERE user_id = ?
        RETURNING ${SELECT_COLUMNS}
      `)
      .get(sessionId, userId) as UserProfileRow | undefined;

    return row ? this.toProfile(row) : null;
  }

  updateCurrentTrip(userId: string, tripId: string): UserProfile | null {
    const row = getDb()
      .prepare(`
        UPDATE user_profiles
        SET current_trip_id = ?, updated_at = datetime('now')
        WHERE user_id = ?
        RETURNING ${SELECT_COLUMNS}
      `)
      .get(tripId, userId) as UserProfileRow | undefined;

    return row ? this.toProfile(row) : null;
  }

  private toProfile(row: UserProfileRow): UserProfile {
    return {
      userId: row.user_id,
      emailAddress: row.email_address,
      firstName: row.first_name,
      lastName: row.last_name,
      passwordHash: row.password_hash,
      phoneNumber: row.phone_number,
      bornOn: row.born_on,
      gender: row.gender,
      title: row.title,
      currentTripId: row.current_trip_id,
      currentSessionId: row.current_session_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
