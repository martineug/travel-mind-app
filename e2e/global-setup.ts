import fs from 'fs';
import path from 'path';

// Fresh slate for every full suite run — createTables() is CREATE TABLE IF NOT EXISTS,
// so it won't clear stale rows left over from a previous run on its own.
export default function globalSetup(): void {
  const dbPath = path.resolve(__dirname, '../server/data/e2e/travel-mind.db');
  for (const suffix of ['', '-wal', '-shm']) {
    const file = dbPath + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
