import { randomUUID } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserFile } from '../../model/user-file';

const { mockChat, mockListFiles } = vi.hoisted(() => ({
  mockChat: vi.fn(),
  mockListFiles: vi.fn<() => UserFile[]>(() => []),
}));

vi.mock('ollama', () => ({
  Ollama: class {
    chat = mockChat;
  },
}));

vi.mock('../../db', async () => {
  const { createTestDb } = await import('../../test-utils/create-test-db');
  const testDb = createTestDb();
  return { getDb: () => testDb };
});

// ChatBotService's constructor builds a real FileService per test, whose constructor does an
// unconditional fs.mkdirSync — against the real filesystem, not a mock, since it's plain Node
// fs. Left unmocked, every test run here creates real empty directories under server/data/files
// for each randomUUID() test user. listFiles is shared/hoisted (rather than a fresh vi.fn() per
// instance) so individual tests can control what it returns.
vi.mock('../file/file-service', () => ({
  FileService: class {
    listFiles = mockListFiles;
    readFile = vi.fn();
    writeFile = vi.fn();
    resolvePath = vi.fn((filepath: string) => filepath);
  },
}));

import { ChatBotService, ChatBusyError } from './chatbot-service';
import { NativeToolAgent } from '../../agent/agent';
import config from '../../config';
import { getDb } from '../../db';

const testDb = getDb();

function insertProfile(userId: string): void {
  testDb.prepare(`
    INSERT INTO user_profiles (user_id, email_address, first_name, last_name, password_hash, phone_number, born_on, gender, title)
    VALUES (?, ?, 'Ada', 'Lovelace', 'hash', '+353861234567', '1990-01-01', 'f', 'ms')
  `).run(userId, `${userId}@example.com`);
}

/** A minimal well-formed ollama ChatResponse — no tool_calls, so NativeToolAgent.run() treats
 *  it as a final answer on the first iteration. */
function chatResponse(content: string) {
  return {
    message: { role: 'assistant', content },
    prompt_eval_count: 1,
    eval_count: 1,
    load_duration: 0,
    prompt_eval_duration: 0,
    eval_duration: 0,
  };
}

beforeEach(() => {
  mockChat.mockReset();
  mockListFiles.mockReset().mockReturnValue([]);
});

describe('ChatBotService per-chat locking', () => {
  it('serializes concurrent getResponseForChat calls for the same chat instead of interleaving them', async () => {
    const userId = randomUUID();
    insertProfile(userId);
    const service = new ChatBotService(userId);
    const chatId = service.currentChatId;

    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });

    mockChat
      .mockImplementationOnce(async () => {
        events.push('first-start');
        await firstGate;
        events.push('first-end');
        return chatResponse('first reply');
      })
      .mockImplementationOnce(async () => {
        events.push('second-start');
        return chatResponse('second reply');
      });

    const first = service.getResponseForChat(chatId, 'hello');
    await vi.waitFor(() => expect(events).toContain('first-start'));

    const second = service.getResponseForChat(chatId, 'world');
    // Give the second call's microtasks a chance to run — it must NOT start yet.
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(events).toEqual(['first-start']);

    releaseFirst();
    const [firstAnswer, secondAnswer] = await Promise.all([first, second]);

    expect(events).toEqual(['first-start', 'first-end', 'second-start']);
    expect(firstAnswer).toBe('first reply');
    expect(secondAnswer).toBe('second reply');
  });

  it('rejects with ChatBusyError once the per-chat queue depth is exceeded', async () => {
    const userId = randomUUID();
    insertProfile(userId);
    const service = new ChatBotService(userId);
    const chatId = service.currentChatId;

    mockChat.mockResolvedValue(chatResponse('ok'));

    // Fired without awaiting in between, so all four hit withChatLock's depth check
    // synchronously before any of them can resolve and free up a slot.
    const p1 = service.getResponseForChat(chatId, 'm1');
    const p2 = service.getResponseForChat(chatId, 'm2');
    const p3 = service.getResponseForChat(chatId, 'm3');
    const p4 = service.getResponseForChat(chatId, 'm4');

    await expect(p4).rejects.toThrow(ChatBusyError);
    await expect(Promise.all([p1, p2, p3])).resolves.toBeDefined();
  });

  it('does not block concurrent calls for a different chat', async () => {
    const userId = randomUUID();
    insertProfile(userId);
    const service = new ChatBotService(userId);
    const chat1 = service.currentChatId;
    service.newChat('flights');
    const chat2 = service.currentChatId;

    const events: string[] = [];
    let releaseChat1!: () => void;
    const chat1Gate = new Promise<void>(resolve => { releaseChat1 = resolve; });

    mockChat
      .mockImplementationOnce(async () => {
        events.push('chat1-start');
        await chat1Gate;
        events.push('chat1-end');
        return chatResponse('a');
      })
      .mockImplementationOnce(async () => {
        events.push('chat2-start');
        return chatResponse('b');
      });

    const p1 = service.getResponseForChat(chat1, 'hi');
    await vi.waitFor(() => expect(events).toContain('chat1-start'));

    const p2 = service.getResponseForChat(chat2, 'hi');
    // chat2 must proceed without waiting for chat1 to finish.
    await vi.waitFor(() => expect(events).toContain('chat2-start'));
    expect(events).not.toContain('chat1-end');

    releaseChat1();
    await Promise.all([p1, p2]);

    expect(events).toEqual(['chat1-start', 'chat2-start', 'chat1-end']);
  });
});

describe('ChatBotService file-claim downgrade', () => {
  it('downgrades to an honest failure when the model claims a file is ready without calling a file tool or having any existing file to fall back to', async () => {
    const userId = randomUUID();
    insertProfile(userId);
    const service = new ChatBotService(userId);
    const chatId = service.currentChatId;

    // Observed in practice: the model skips calling generate_itinerary_pdf entirely, invents its
    // own "action" value, and claims the file is being generated anyway — no tool_calls at all.
    mockChat.mockResolvedValue(chatResponse(
      '{"action":"generate_itinerary_pdf","message":"Your itinerary PDF is being generated — you can download it below once ready."}',
    ));

    const answer = await service.getResponseForChat(chatId, 'Generate a PDF of my itinerary');

    expect(JSON.parse(answer)).toEqual({
      action: 'chat',
      message: "Sorry — I wasn't able to generate that file. Could you ask me again?",
    });
  });

  it('attaches the complete file list, not just one file, when files exist but no file tool was called this turn', async () => {
    const userId = randomUUID();
    insertProfile(userId);
    const service = new ChatBotService(userId);
    const chatId = service.currentChatId;

    // Observed in practice: asked to "list my files", the model recalls the itinerary-ready
    // phrasing from earlier context instead of calling list_files. With only one real file on
    // record it's impossible to tell from the reply alone whether this is a genuine listing or
    // just the single-file fallback in disguise — so the fallback must always attach every file
    // the user actually has, never just a guessed "most recent" one.
    mockListFiles.mockReturnValue([
      { id: 'f1', filename: 'itinerary_Paris_Trip_2026_09.pdf', filepath: '/x', createdAt: '2026-07-01', updatedAt: '2026-07-01' },
      { id: 'f2', filename: 'itinerary_Rome_Trip_2026_10.pdf', filepath: '/y', createdAt: '2026-07-15', updatedAt: '2026-07-15' },
    ]);
    mockChat.mockResolvedValue(chatResponse(
      '{"action":"chat","message":"Your itinerary PDF is ready — you can download it below. Let me know if you need anything else!"}',
    ));

    const answer = await service.getResponseForChat(chatId, 'Please list my files');
    const parsed = JSON.parse(answer);

    expect(parsed.file).toBeUndefined();
    expect(parsed.files).toEqual([
      { name: 'itinerary_Paris_Trip_2026_09.pdf', url: `/api/chatbot/files/${encodeURIComponent('itinerary_Paris_Trip_2026_09.pdf')}` },
      { name: 'itinerary_Rome_Trip_2026_10.pdf', url: `/api/chatbot/files/${encodeURIComponent('itinerary_Rome_Trip_2026_10.pdf')}` },
    ]);
  });
});

describe('ChatBotService agent cache idle-TTL sweep', () => {
  it('reuses the cached agent within the TTL, rebuilds it once the TTL passes', async () => {
    vi.useFakeTimers();
    try {
      const userId = randomUUID();
      insertProfile(userId);
      const service = new ChatBotService(userId);
      const chatId = service.currentChatId;

      const setHistorySpy = vi.spyOn(NativeToolAgent.prototype, 'setMessageHistory');
      mockChat.mockResolvedValue(chatResponse('ok'));

      await service.getResponseForChat(chatId, 'first');
      expect(setHistorySpy).toHaveBeenCalledTimes(1);

      await service.getResponseForChat(chatId, 'second');
      expect(setHistorySpy).toHaveBeenCalledTimes(1); // cache hit — no rebuild

      vi.advanceTimersByTime(config.session.idleTtlMs + 1000);

      await service.getResponseForChat(chatId, 'third');
      expect(setHistorySpy).toHaveBeenCalledTimes(2); // idle past the TTL — swept and rebuilt

      setHistorySpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});
