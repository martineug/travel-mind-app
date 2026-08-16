import { randomUUID } from 'crypto';
import { getDb } from '../db';
import { ChatSession } from '../model/chat-session';
import { ChatMessage } from '../model/chat-message';
import { AgentType } from '../model/agent-type';
import { WizardAnswer } from '../model/wizard-question';

interface ChatMessageRow {
  role: string;
  content: string;
  created_at: string;
}

export class ChatMessageRepository {
  constructor(private readonly userId: string) {}

  /** Batches the messages query across every session instead of the one-query-per-session
   *  toSession() would do in a .map() — that N+1 showed up on every GET /api/chatbot (the chat
   *  history panel's load/refresh), each query serially blocking the event loop. */
  findAll(tripId: string): ChatSession[] {
    const rows = getDb()
      .prepare('SELECT id, agent_type, last_search_answers FROM chat_sessions WHERE user_id = ? AND trip_id = ? ORDER BY sort_order ASC')
      .all(this.userId, tripId) as { id: string; agent_type: AgentType; last_search_answers: string | null }[];

    if (rows.length === 0) return [];

    const messagesBySession = this.findMessagesForSessions(rows.map(row => row.id));

    return rows.map(row => ({
      id: row.id,
      tripId,
      agentType: row.agent_type,
      lastSearchAnswers: row.last_search_answers ? JSON.parse(row.last_search_answers) : null,
      messages: messagesBySession.get(row.id) ?? [],
    }));
  }

  /** One query for however many session ids, grouped by session in memory afterwards — the
   *  ORDER BY rowid on the full result set keeps each session's own messages in the same
   *  relative order toSession() would have produced one at a time. */
  private findMessagesForSessions(sessionIds: string[]): Map<string, ChatMessage[]> {
    const placeholders = sessionIds.map(() => '?').join(', ');
    const rows = getDb()
      .prepare(`SELECT session_id, role, content, created_at FROM chat_messages WHERE session_id IN (${placeholders}) ORDER BY rowid`)
      .all(...sessionIds) as (ChatMessageRow & { session_id: string })[];

    const bySession = new Map<string, ChatMessage[]>();
    for (const row of rows) {
      const message = { role: row.role, content: row.content, createdAt: row.created_at };
      const existing = bySession.get(row.session_id);
      if (existing) {
        existing.push(message);
      } else {
        bySession.set(row.session_id, [message]);
      }
    }
    return bySession;
  }

  findLatest(tripId: string): ChatSession | null {
    const row = getDb()
      .prepare('SELECT id, agent_type, last_search_answers FROM chat_sessions WHERE user_id = ? AND trip_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(this.userId, tripId) as { id: string; agent_type: AgentType; last_search_answers: string | null } | undefined;

    return row ? this.toSession(row.id, tripId, row.agent_type, row.last_search_answers) : null;
  }

  findById(id: string): ChatSession | null {
    const row = getDb()
      .prepare('SELECT id, trip_id, agent_type, last_search_answers FROM chat_sessions WHERE user_id = ? AND id = ?')
      .get(this.userId, id) as { id: string; trip_id: string; agent_type: AgentType; last_search_answers: string | null } | undefined;

    return row ? this.toSession(row.id, row.trip_id, row.agent_type, row.last_search_answers) : null;
  }

  create(tripId: string, agentType: AgentType, answers?: Record<string, WizardAnswer>): ChatSession {
    const id = randomUUID();

    getDb()
      .prepare(`
        INSERT INTO chat_sessions (id, user_id, trip_id, agent_type, sort_order, last_search_answers)
        VALUES (?, ?, ?, ?, (
          SELECT COALESCE(MIN(sort_order), 1) - 1 FROM chat_sessions WHERE trip_id = ? AND user_id = ?
        ), ?)
      `)
      .run(id, this.userId, tripId, agentType, tripId, this.userId, answers ? JSON.stringify(answers) : null);

    return { id, tripId, agentType, lastSearchAnswers: answers ?? null, messages: [] };
  }

  reorder(tripId: string, orderedChatIds: string[]): void {
    const db = getDb();

    const update = db.transaction((ids: string[]) => {
      ids.forEach((chatId, index) => {
        db.prepare('UPDATE chat_sessions SET sort_order = ? WHERE id = ? AND user_id = ? AND trip_id = ?')
          .run(index, chatId, this.userId, tripId);
      });
    });

    update(orderedChatIds);
  }

  delete(id: string): boolean {
    const db = getDb();

    return db.transaction(() => {
      db.prepare(`
        UPDATE user_profiles
        SET current_session_id = NULL
        WHERE user_id = ? AND current_session_id = ?
      `).run(this.userId, id);

      db.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(id);
      db.prepare('DELETE FROM chat_summaries WHERE user_id = ? AND chat_id = ?').run(this.userId, id);

      const result = db.prepare('DELETE FROM chat_sessions WHERE id = ? AND user_id = ?').run(id, this.userId);
      return result.changes > 0;
    })();
  }

  createMessage(sessionId: string, role: string, content: string): ChatMessage {
    const row = getDb()
      .prepare('INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, ?, ?) RETURNING role, content, created_at')
      .get(randomUUID(), sessionId, role, content) as ChatMessageRow;

    getDb()
      .prepare(`UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?`)
      .run(sessionId);

    return { role: row.role, content: row.content, createdAt: row.created_at };
  }

  private toSession(id: string, tripId: string, agentType: AgentType, lastSearchAnswersRaw: string | null): ChatSession {
    const rows = getDb()
      .prepare('SELECT role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY rowid')
      .all(id) as ChatMessageRow[];

    return {
      id,
      tripId,
      agentType,
      lastSearchAnswers: lastSearchAnswersRaw ? JSON.parse(lastSearchAnswersRaw) : null,
      messages: rows.map(row => ({ role: row.role, content: row.content, createdAt: row.created_at })),
    };
  }
}
