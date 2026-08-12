import { randomUUID } from 'crypto';
import { getDb } from '../db';
import { UserTrip } from '../model/user-trip';

interface UserTripRow {
  id: string;
  trip_name: string;
  created_at: string;
  updated_at: string;
}

export class UserTripRepository {
  constructor(private readonly userId: string) {}

  findByUserId(): UserTrip[] {
    const rows = getDb()
      .prepare('SELECT id, trip_name, created_at, updated_at FROM user_trips WHERE user_id = ? ORDER BY rowid')
      .all(this.userId) as UserTripRow[];

    return rows.map(row => ({ id: row.id, tripName: row.trip_name, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  findById(id: string): UserTrip | null {
    const row = getDb()
      .prepare('SELECT id, trip_name, created_at, updated_at FROM user_trips WHERE id = ? AND user_id = ?')
      .get(id, this.userId) as UserTripRow | undefined;

    return row ? { id: row.id, tripName: row.trip_name, createdAt: row.created_at, updatedAt: row.updated_at } : null;
  }

  update(id: string, tripName: string): UserTrip | null {
    const row = getDb()
      .prepare(`
        UPDATE user_trips
        SET trip_name = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
        RETURNING id, trip_name, created_at, updated_at
      `)
      .get(tripName, id, this.userId) as UserTripRow | undefined;

    if (!row) return null;

    return { id: row.id, tripName: row.trip_name, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  delete(id: string): boolean {
    const db = getDb();

    return db.transaction(() => {
      // Clear current_session_id on user_profiles if it points into this trip
      db.prepare(`
        UPDATE user_profiles
        SET current_session_id = NULL
        WHERE user_id = ? AND current_session_id IN (
          SELECT id FROM chat_sessions WHERE trip_id = ? AND user_id = ?
        )
      `).run(this.userId, id, this.userId);

      db.prepare(`
        DELETE FROM chat_messages
        WHERE session_id IN (SELECT id FROM chat_sessions WHERE trip_id = ? AND user_id = ?)
      `).run(id, this.userId);

      db.prepare(`
        DELETE FROM chat_summaries
        WHERE user_id = ? AND chat_id IN (SELECT id FROM chat_sessions WHERE trip_id = ? AND user_id = ?)
      `).run(this.userId, id, this.userId);

      db.prepare('DELETE FROM chat_sessions WHERE trip_id = ? AND user_id = ?').run(id, this.userId);

      // Bookings hang off trip_id only (no user_id), so skipping this would strand them
      // permanently. Scoped through user_trips (not a raw trip_id match) so a trip id
      // belonging to another user can't delete their bookings — same pattern as above.
      for (const table of ['flight_bookings', 'stay_bookings', 'car_bookings']) {
        db.prepare(`
          DELETE FROM ${table}
          WHERE trip_id IN (SELECT id FROM user_trips WHERE id = ? AND user_id = ?)
        `).run(id, this.userId);
      }

      const result = db.prepare('DELETE FROM user_trips WHERE id = ? AND user_id = ?').run(id, this.userId);
      return result.changes > 0;
    })();
  }

  create(tripName: string): UserTrip {
    const id = randomUUID();

    const row = getDb()
      .prepare('INSERT INTO user_trips (id, user_id, trip_name) VALUES (?, ?, ?) RETURNING created_at, updated_at')
      .get(id, this.userId, tripName) as Pick<UserTripRow, 'created_at' | 'updated_at'>;

    return { id, tripName, createdAt: row.created_at, updatedAt: row.updated_at };
  }
}
