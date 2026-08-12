import { getDb } from '../db';
import { ChatSummary } from '../model/chat-summary';

interface ChatSummaryRow {
  chat_id: string;
  summary: string;
  created_at: string;
  updated_at: string;
}

export class ChatSummaryRepository {
  constructor(private readonly userId: string) {}

  findAll(): ChatSummary[] {
    const rows = getDb()
      .prepare('SELECT chat_id, summary, created_at, updated_at FROM chat_summaries WHERE user_id = ? ORDER BY chat_id')
      .all(this.userId) as ChatSummaryRow[];

    return rows.map(row => this.toSummary(row));
  }

  findByChatId(chatId: string): ChatSummary | null {
    const row = getDb()
      .prepare('SELECT chat_id, summary, created_at, updated_at FROM chat_summaries WHERE user_id = ? AND chat_id = ?')
      .get(this.userId, chatId) as ChatSummaryRow | undefined;

    return row ? this.toSummary(row) : null;
  }

  create(chatId: string, summary: string): ChatSummary {
    const row = getDb()
      .prepare(`
        INSERT INTO chat_summaries (user_id, chat_id, summary)
        VALUES (?, ?, ?)
        RETURNING chat_id, summary, created_at, updated_at
      `)
      .get(this.userId, chatId, summary) as ChatSummaryRow;

    return this.toSummary(row);
  }

  update(chatId: string, summary: string): ChatSummary | null {
    const row = getDb()
      .prepare(`
        UPDATE chat_summaries
        SET summary = ?, updated_at = datetime('now')
        WHERE user_id = ? AND chat_id = ?
        RETURNING chat_id, summary, created_at, updated_at
      `)
      .get(summary, this.userId, chatId) as ChatSummaryRow | undefined;

    return row ? this.toSummary(row) : null;
  }

  private toSummary(row: ChatSummaryRow): ChatSummary {
    return { chatId: row.chat_id, summary: row.summary, createdAt: row.created_at, updatedAt: row.updated_at };
  }
}
