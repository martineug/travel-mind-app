import { randomUUID } from 'crypto';
import { getDb } from '../db';
import { UserFile } from '../model/user-file';

interface UserFileRow {
  id: string;
  filename: string;
  filepath: string;
  created_at: string;
  updated_at: string;
}

export class UserFileRepository {
  constructor(private readonly userId: string) {}

  findByUserId(): UserFile[] {
    const rows = getDb()
      .prepare('SELECT id, filename, filepath, created_at, updated_at FROM user_files WHERE user_id = ? ORDER BY filename')
      .all(this.userId) as UserFileRow[];

    return rows.map(row => this.toFile(row));
  }

  findByFilename(filename: string): UserFile | null {
    const row = getDb()
      .prepare('SELECT id, filename, filepath, created_at, updated_at FROM user_files WHERE user_id = ? AND filename = ?')
      .get(this.userId, filename) as UserFileRow | undefined;

    return row ? this.toFile(row) : null;
  }

  create(filename: string, filepath: string): UserFile {
    const row = getDb()
      .prepare('INSERT INTO user_files (id, user_id, filename, filepath) VALUES (?, ?, ?, ?) RETURNING id, filename, filepath, created_at, updated_at')
      .get(randomUUID(), this.userId, filename, filepath) as UserFileRow;

    return this.toFile(row);
  }

  update(id: string, filepath: string): UserFile | null {
    const row = getDb()
      .prepare(`
        UPDATE user_files
        SET filepath = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
        RETURNING id, filename, filepath, created_at, updated_at
      `)
      .get(filepath, id, this.userId) as UserFileRow | undefined;

    return row ? this.toFile(row) : null;
  }

  private toFile(row: UserFileRow): UserFile {
    return { id: row.id, filename: row.filename, filepath: row.filepath, createdAt: row.created_at, updatedAt: row.updated_at };
  }
}
