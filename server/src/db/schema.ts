import Database from 'better-sqlite3-multiple-ciphers';

/** The whole schema as plain `CREATE TABLE IF NOT EXISTS` statements — no migration
 *  framework by design (single-dev DB). Schema changes edit these column lists directly;
 *  an existing DB is dropped/recreated, not migrated. Only add ALTER TABLE/backfill if you need to preserve running data, then remove it once served. */
export function createTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id         TEXT PRIMARY KEY,
      email_address   TEXT NOT NULL UNIQUE,
      first_name      TEXT NOT NULL,
      last_name       TEXT NOT NULL,
      password_hash   TEXT NOT NULL,
      -- Traveller identity for the account holder, captured at registration so bookings
      -- never have to ask for it again. They are the implicit "self" traveller in the
      -- booking picker, and the guest/driver for every stay/car booking.
      phone_number    TEXT NOT NULL,
      born_on         TEXT NOT NULL,
      gender          TEXT NOT NULL,
      title           TEXT NOT NULL,
      current_trip_id    TEXT REFERENCES user_trips(id),
      current_session_id TEXT REFERENCES chat_sessions(id),
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Additional travellers the user has booked for before, offered for selection at
    -- booking time. Deliberately excludes the account holder — they're composed from
    -- user_profiles above, so their identity has exactly one source of truth.
    CREATE TABLE IF NOT EXISTS traveller_profiles (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      given_name   TEXT NOT NULL,
      family_name  TEXT NOT NULL,
      email        TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      born_on      TEXT NOT NULL,
      gender       TEXT NOT NULL,
      title        TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      -- Makes re-selecting an existing traveller on a later booking a no-op update rather
      -- than a duplicate row (see TravellerProfileRepository.upsert).
      UNIQUE (user_id, given_name, family_name, born_on)
    );

    CREATE INDEX IF NOT EXISTS idx_traveller_profiles_user
      ON traveller_profiles(user_id);

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT NOT NULL,
      trip_id             TEXT NOT NULL REFERENCES user_trips(id),
      agent_type          TEXT NOT NULL DEFAULT 'flights',
      sort_order          INTEGER NOT NULL DEFAULT 0,
      last_search_answers TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_user
      ON chat_sessions(user_id);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id         TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id),
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session
      ON chat_messages(session_id);

    CREATE TABLE IF NOT EXISTS user_memories (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      memory     TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_user_memories_user
      ON user_memories(user_id);

    CREATE TABLE IF NOT EXISTS user_trips (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      trip_name  TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_user_trips_user
      ON user_trips(user_id);

    CREATE TABLE IF NOT EXISTS chat_summaries (
      user_id    TEXT NOT NULL,
      chat_id    TEXT NOT NULL,
      summary    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, chat_id)
    );

    CREATE TABLE IF NOT EXISTS user_files (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      filename   TEXT NOT NULL,
      filepath   TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, filename)
    );

    CREATE INDEX IF NOT EXISTS idx_user_files_user
      ON user_files(user_id);

    CREATE TABLE IF NOT EXISTS flight_bookings (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id              TEXT NOT NULL UNIQUE,
      booking_reference     TEXT,
      offer_id              TEXT NOT NULL,
      trip_id               TEXT NOT NULL DEFAULT '',
      origin                TEXT NOT NULL DEFAULT '',
      destination           TEXT NOT NULL DEFAULT '',
      departure_date        TEXT NOT NULL DEFAULT '',
      return_date           TEXT,
      airline               TEXT,
      flight_number         TEXT,
      dep                   TEXT,
      arr                   TEXT,
      dur                   TEXT,
      return_dep            TEXT,
      return_arr            TEXT,
      return_dur            TEXT,
      passengers            TEXT NOT NULL,
      total_amount          TEXT NOT NULL,
      total_currency        TEXT NOT NULL,
      documents             TEXT NOT NULL,
      payment_intent_id     TEXT NOT NULL,
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stay_bookings (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      duffel_booking_id   TEXT NOT NULL UNIQUE,
      reference           TEXT,
      trip_id             TEXT NOT NULL DEFAULT '',
      accommodation_name  TEXT NOT NULL,
      check_in_date       TEXT NOT NULL,
      check_out_date      TEXT NOT NULL,
      guests              TEXT NOT NULL,
      total_amount        TEXT NOT NULL,
      total_currency      TEXT NOT NULL,
      status              TEXT NOT NULL,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS car_bookings (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      duffel_booking_id   TEXT NOT NULL UNIQUE,
      reference           TEXT,
      trip_id             TEXT NOT NULL DEFAULT '',
      supplier_name       TEXT NOT NULL,
      car_name            TEXT NOT NULL,
      pickup_date         TEXT NOT NULL,
      dropoff_date        TEXT NOT NULL,
      driver_given_name   TEXT NOT NULL,
      driver_family_name  TEXT NOT NULL,
      driver_email        TEXT NOT NULL,
      driver_phone        TEXT NOT NULL,
      total_amount        TEXT NOT NULL,
      total_currency      TEXT NOT NULL,
      status              TEXT NOT NULL,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS call_metrics (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      call_type               TEXT NOT NULL,
      name                    TEXT NOT NULL,
      label                   TEXT,
      user_id                 TEXT,
      chat_id                 TEXT,
      success                 INTEGER NOT NULL,
      error                   TEXT,
      duration_ms             INTEGER NOT NULL,
      prompt_tokens           INTEGER,
      completion_tokens       INTEGER,
      load_duration_ms        INTEGER,
      prompt_eval_duration_ms INTEGER,
      eval_duration_ms        INTEGER,
      had_tool_calls          INTEGER,
      request_payload         TEXT,
      response_payload        TEXT,
      created_at              TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_call_metrics_created ON call_metrics(created_at);
    CREATE INDEX IF NOT EXISTS idx_call_metrics_type ON call_metrics(call_type, created_at);
  `);
}
