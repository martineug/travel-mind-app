import { randomUUID } from 'crypto';
import { getDb } from '../db';
import { UserMemory } from '../model/user-memory';

interface UserMemoryRow {
  id: string;
  memory: string;
  created_at: string;
  updated_at: string;
}

export class UserMemoryRepository {
  constructor(private readonly userId: string) {}

  findByUserId(): UserMemory[] {
    const rows = getDb()
      .prepare('SELECT id, memory, created_at, updated_at FROM user_memories WHERE user_id = ? ORDER BY rowid')
      .all(this.userId) as UserMemoryRow[];

    return rows.map(row => this.toMemory(row));
  }

  create(memory: string): UserMemory {
    const row = getDb()
      .prepare('INSERT INTO user_memories (id, user_id, memory) VALUES (?, ?, ?) RETURNING id, memory, created_at, updated_at')
      .get(randomUUID(), this.userId, memory) as UserMemoryRow;

    return this.toMemory(row);
  }

  update(id: string, memory: string): UserMemory | null {
    const row = getDb()
      .prepare(`
        UPDATE user_memories
        SET memory = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
        RETURNING id, memory, created_at, updated_at
      `)
      .get(memory, id, this.userId) as UserMemoryRow | undefined;

    return row ? this.toMemory(row) : null;
  }

  private toMemory(row: UserMemoryRow): UserMemory {
    return { id: row.id, memory: row.memory, createdAt: row.created_at, updatedAt: row.updated_at };
  }
}
