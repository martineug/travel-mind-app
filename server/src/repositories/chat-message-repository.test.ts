import { randomUUID } from 'crypto';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../db', async () => {
  const { createTestDb } = await import('../test-utils/create-test-db');
  const testDb = createTestDb();
  return { getDb: () => testDb };
});

import { ChatMessageRepository } from './chat-message-repository';
import { getDb } from '../db';

const testDb = getDb();

function insertTrip(userId: string, tripId: string): void {
  testDb.prepare(`
    INSERT INTO user_trips (id, user_id, trip_name) VALUES (?, ?, 'Test Trip')
  `).run(tripId, userId);
}

describe('ChatMessageRepository.findAll', () => {
  it('returns an empty array when the trip has no chats, without querying messages', () => {
    const userId = randomUUID();
    const tripId = randomUUID();
    insertTrip(userId, tripId);
    const repo = new ChatMessageRepository(userId);

    expect(repo.findAll(tripId)).toEqual([]);
  });

  it('returns each session with its own messages in the same order as sending them, unaffected by other sessions', () => {
    const userId = randomUUID();
    const tripId = randomUUID();
    insertTrip(userId, tripId);
    const repo = new ChatMessageRepository(userId);

    const chatA = repo.create(tripId, 'flights');
    const chatB = repo.create(tripId, 'stays');
    const chatC = repo.create(tripId, 'cars'); // no messages at all

    repo.createMessage(chatA.id, 'user', 'a1');
    repo.createMessage(chatB.id, 'user', 'b1');
    repo.createMessage(chatA.id, 'assistant', 'a2');
    repo.createMessage(chatB.id, 'assistant', 'b2');
    repo.createMessage(chatA.id, 'user', 'a3');

    const sessions = repo.findAll(tripId);
    const byId = new Map(sessions.map(s => [s.id, s]));

    expect(sessions).toHaveLength(3);
    expect(byId.get(chatA.id)!.messages.map(m => m.content)).toEqual(['a1', 'a2', 'a3']);
    expect(byId.get(chatB.id)!.messages.map(m => m.content)).toEqual(['b1', 'b2']);
    expect(byId.get(chatC.id)!.messages).toEqual([]);
  });

  it('matches findById\'s single-session result for the same chat', () => {
    const userId = randomUUID();
    const tripId = randomUUID();
    insertTrip(userId, tripId);
    const repo = new ChatMessageRepository(userId);

    const chat = repo.create(tripId, 'flights');
    repo.createMessage(chat.id, 'user', 'hello');
    repo.createMessage(chat.id, 'assistant', 'hi there');

    const viaFindAll = repo.findAll(tripId).find(s => s.id === chat.id);
    const viaFindById = repo.findById(chat.id);

    expect(viaFindAll).toEqual(viaFindById);
  });
});
