import Database from 'better-sqlite3-multiple-ciphers';
import { createTables } from '../db/schema';

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  createTables(db);
  return db;
}
