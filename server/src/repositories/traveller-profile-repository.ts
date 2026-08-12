import { randomUUID } from 'crypto';
import { getDb } from '../db';
import { TravellerProfile } from '../model/traveller-profile';

interface TravellerProfileRow {
  id: string;
  given_name: string;
  family_name: string;
  email: string;
  phone_number: string;
  born_on: string;
  gender: string;
  title: string;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = 'id, given_name, family_name, email, phone_number, born_on, gender, title, created_at, updated_at';

export interface TravellerProfileInput {
  givenName: string;
  familyName: string;
  email: string;
  phoneNumber: string;
  bornOn: string;
  gender: string;
  title: string;
}

export class TravellerProfileRepository {
  constructor(private readonly userId: string) {}

  findByUserId(): TravellerProfile[] {
    const rows = getDb()
      .prepare(`SELECT ${SELECT_COLUMNS} FROM traveller_profiles WHERE user_id = ? ORDER BY rowid`)
      .all(this.userId) as TravellerProfileRow[];

    return rows.map(row => this.toProfile(row));
  }

  /** Saves a traveller, refreshing contact details of an existing one rather than duplicating — identity is name + date of birth, per the UNIQUE constraint. */
  upsert(input: TravellerProfileInput): TravellerProfile {
    const row = getDb()
      .prepare(`
        INSERT INTO traveller_profiles (id, user_id, given_name, family_name, email, phone_number, born_on, gender, title)
        VALUES (@id, @user_id, @given_name, @family_name, @email, @phone_number, @born_on, @gender, @title)
        ON CONFLICT (user_id, given_name, family_name, born_on) DO UPDATE SET
          email = excluded.email,
          phone_number = excluded.phone_number,
          gender = excluded.gender,
          title = excluded.title,
          updated_at = datetime('now')
        RETURNING ${SELECT_COLUMNS}
      `)
      .get({
        id: randomUUID(),
        user_id: this.userId,
        given_name: input.givenName,
        family_name: input.familyName,
        email: input.email,
        phone_number: input.phoneNumber,
        born_on: input.bornOn,
        gender: input.gender,
        title: input.title,
      }) as TravellerProfileRow;

    return this.toProfile(row);
  }

  private toProfile(row: TravellerProfileRow): TravellerProfile {
    return {
      id: row.id,
      givenName: row.given_name,
      familyName: row.family_name,
      email: row.email,
      phoneNumber: row.phone_number,
      bornOn: row.born_on,
      gender: row.gender,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
