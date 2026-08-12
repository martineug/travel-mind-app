import Database from 'better-sqlite3-multiple-ciphers';
import fs from 'fs';
import path from 'path';
import config from '../config';
import { createTables } from './schema';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.resolve(__dirname, '..', '..', config.DB_PATH);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    db = new Database(dbPath);
    db.pragma("cipher='sqlcipher'");
    db.pragma(`key='${config.DB_ENCRYPTION_KEY.replace(/'/g, "''")}'`);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');

    createTables(db);
  }

  return db;
}
