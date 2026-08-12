import '../config';
import { getDb } from '../db';

const table = process.argv[2];

const db = getDb();

if (!table) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as { name: string }[];

  console.log('Tables:');
  for (const { name } of tables) {
    const { count } = db.prepare(`SELECT COUNT(*) as count FROM ${name}`).get() as { count: number };
    console.log(`  ${name} (${count} rows)`);
  }
  console.log('\nUsage: npm run db:inspect -- <table> [limit]');
} else {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);

  if (!exists) {
    console.error(`Unknown table: ${table}`);
    process.exit(1);
  }

  const limit = Number(process.argv[3] ?? 50);
  const rows = db.prepare(`SELECT * FROM ${table} LIMIT ?`).all(limit);
  console.log(JSON.stringify(rows, null, 2));
}
