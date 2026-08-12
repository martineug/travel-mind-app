import os from 'os';
import path from 'path';
import { Router, Request, Response, NextFunction } from 'express';
import { COOKIE_NAME } from './session';
import multer from 'multer';
import { getUserFromToken } from '../service/auth/auth-service';
import { ChatBotService, ChatBusyError } from '../service/chat/chatbot-service';
import { TripError } from '../service/trip/trip-service';
import { OllamaBusyError } from '../agent/ollama-gate';
import { isAgentType } from '../model/agent-type';
import { buildVerticalKickoffMessage } from '../agent/prompts';
import { WizardAnswer } from '../model/wizard-question';
import { createLogger } from '../logger';
import config from '../config';

const ALLOWED_EXTENSIONS = new Set(['pdf']);


const router = Router();
const upload = multer({ dest: os.tmpdir() });
const logger = createLogger('chat-controller');

// Never evicting this would leak a ChatBotService (and everything it caches, see
// chatbot-service.ts's agentCache) per user for the life of the process — see the sweep below.
interface ChatBotEntry {
  bot: ChatBotService;
  lastAccess: number;
}

const chatbots = new Map<string, ChatBotEntry>();

function getChatBot(req: Request): ChatBotService {
  const token = req.cookies?.[COOKIE_NAME];
  const user = token ? getUserFromToken(token) : null;

  if (!user) {
    throw new AuthRequiredError();
  }

  let entry = chatbots.get(user.userId);
  if (!entry) {
    entry = { bot: new ChatBotService(user.userId), lastAccess: Date.now() };
    chatbots.set(user.userId, entry);
  } else {
    entry.lastAccess = Date.now();
  }

  return entry.bot;
}

/** Evicts a user's cached ChatBotService — safe at any time: it's rebuilt on next access
 *  from the DB (see ChatBotService's constructor and loadAgentHistoryInto) */
export function evictChatBot(userId: string): void {
  chatbots.delete(userId);
}

/** Deals with worst-case memory growth for users who never sign out  */
const sweepTimer = setInterval(() => {
  const cutoff = Date.now() - config.session.idleTtlMs;
  for (const [userId, entry] of chatbots) {
    if (entry.lastAccess < cutoff) {
      chatbots.delete(userId);
    }
  }
}, config.session.sweepIntervalMs);
sweepTimer.unref();

class AuthRequiredError extends Error {}

function withChatBot(handler: (bot: ChatBotService, req: Request, res: Response) => unknown) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bot = getChatBot(req);
      await handler(bot, req, res);
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        return res.status(401).json({ error: 'Not signed in' });
      }
      next(err);
    }
  };
}

// GET /api/chatbot — current chat state
router.get('/chatbot', withChatBot((bot, _req, res) => {
  logger.traceCall('GET /chatbot', {}, {});
  res.json({
    currentChatId: bot.currentChatId,
    currentTripId: bot.currentTripId,
    currentAgentType: bot.currentAgentType,
    messages: bot.getChatMessages(),
    chats: bot.getAllChats(),
  });
  logger.traceRet('GET /chatbot', { currentChatId: bot.currentChatId, currentTripId: bot.currentTripId });
}));

// PUT /api/chatbot/current-trip — switch the active trip
router.put('/chatbot/current-trip', withChatBot((bot, req, res) => {
  const { tripId } = req.body as { tripId: string };
  logger.traceCall('PUT /chatbot/current-trip', { tripId }, {});

  try {
    bot.switchTrip(tripId);
  } catch (err) {
    if (err instanceof TripError) {
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }

  res.json({
    currentTripId: bot.currentTripId,
    currentChatId: bot.currentChatId,
    currentAgentType: bot.currentAgentType,
    messages: bot.getChatMessages(),
    chats: bot.getAllChats(),
  });
  logger.traceRet('PUT /chatbot/current-trip', { currentTripId: bot.currentTripId, currentChatId: bot.currentChatId });
}));

// POST /api/chatbot/chats — start a new chat. An optional `description` returns a
// ready-to-send `kickoffMessage` (pure string building, no LLM call), so the client can
// fire it via POST /chatbot/message without knowing the guardrail wording, kept server-side.
router.post('/chatbot/chats', withChatBot((bot, req, res) => {
  const { agentType, description, answers } = req.body as {
    agentType?: string; description?: string; answers?: Record<string, WizardAnswer>;
  };
  logger.traceCall('POST /chatbot/chats', { agentType }, { description, answers });

  if (!isAgentType(agentType)) {
    return res.status(400).json({ error: 'agentType must be one of: flights, stays, cars' });
  }

  // Best-effort only — chat creation must succeed even if answers is absent/malformed, unlike POST .../edit-search.
  bot.newChat(agentType, answers && typeof answers === 'object' ? answers : undefined);

  const kickoffMessage = typeof description === 'string' && description.trim()
    ? buildVerticalKickoffMessage(agentType, description)
    : undefined;

  res.json({ currentChatId: bot.currentChatId, currentAgentType: bot.currentAgentType, kickoffMessage });
  logger.traceRet('POST /chatbot/chats', { currentChatId: bot.currentChatId });
}));

// GET /api/chatbot/chats/:chatId — switch to an existing chat
router.get('/chatbot/chats/:chatId', withChatBot((bot, req, res) => {
  const { chatId } = req.params as { chatId: string };
  logger.traceCall('GET /chatbot/chats/:chatId', { chatId }, {});

  try {
    bot.switchChat(chatId);
  } catch {
    return res.status(404).json({ error: `Chat not found: ${chatId}` });
  }

  res.json({
    currentChatId: bot.currentChatId,
    currentAgentType: bot.currentAgentType,
    messages: bot.getChatMessages(),
  });
  logger.traceRet('GET /chatbot/chats/:chatId', { chatId });
}));

// GET .../edit-search — question set for the in-chat "Edit search" panel, pre-filled from the chat's own last-submitted answers if any.
router.get('/chatbot/chats/:chatId/edit-search', withChatBot((bot, req, res) => {
  const { chatId } = req.params as { chatId: string };
  logger.traceCall('GET /chatbot/chats/:chatId/edit-search', { chatId }, {});

  const result = bot.getEditSearchQuestions(chatId);
  if (!result) {
    return res.status(404).json({ error: `Chat not found: ${chatId}` });
  }

  res.json(result);
  logger.traceRet('GET /chatbot/chats/:chatId/edit-search', { chatId, agentType: result.agentType });
}));

// POST .../edit-search — persists the submitted answers against this chat, and returns a
// kickoff message wrapping `description` via the same buildVerticalKickoffMessage every
// search uses. Doesn't fire the restart — the client sends it via POST /chatbot/message.
router.post('/chatbot/chats/:chatId/edit-search', withChatBot((bot, req, res) => {
  const { chatId } = req.params as { chatId: string };
  const { answers, description } = req.body as { answers?: Record<string, WizardAnswer>; description?: string };
  logger.traceCall('POST /chatbot/chats/:chatId/edit-search', { chatId }, { description, answers });

  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'answers is required' });
  }
  if (typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'description is required' });
  }

  const result = bot.submitEditedSearch(chatId, answers, description);
  if (!result) {
    return res.status(404).json({ error: `Chat not found: ${chatId}` });
  }

  res.json(result);
  logger.traceRet('POST /chatbot/chats/:chatId/edit-search', { chatId });
}));

// POST .../cancel-payment — records the payment sheet was closed, so it won't re-open the unpaid action:"payment" on next load.
router.post('/chatbot/chats/:chatId/cancel-payment', withChatBot((bot, req, res) => {
  const { chatId } = req.params as { chatId: string };
  logger.traceCall('POST /chatbot/chats/:chatId/cancel-payment', { chatId }, {});

  if (!bot.cancelPayment(chatId)) {
    return res.status(404).json({ error: `Chat not found: ${chatId}` });
  }

  res.json({ ok: true });
  logger.traceRet('POST /chatbot/chats/:chatId/cancel-payment', { chatId });
}));

// PATCH /api/chatbot/chats — persist a new drag-and-drop order. Deliberately on the
// collection, not /chats/order — a literal segment in the :chatId slot risks shadowing.
router.patch('/chatbot/chats', withChatBot((bot, req, res) => {
  const { chatIds } = req.body as { chatIds?: string[] };
  logger.traceCall('PATCH /chatbot/chats', { count: chatIds?.length }, { chatIds });

  if (!Array.isArray(chatIds) || !chatIds.every(id => typeof id === 'string')) {
    return res.status(400).json({ error: 'chatIds must be an array of strings' });
  }

  bot.reorderChats(chatIds);
  res.json({ chats: bot.getAllChats() });
  logger.traceRet('PATCH /chatbot/chats', { count: chatIds.length });
}));

// DELETE /api/chatbot/chats/:chatId — delete a chat
router.delete('/chatbot/chats/:chatId', withChatBot((bot, req, res) => {
  const { chatId } = req.params as { chatId: string };
  logger.traceCall('DELETE /chatbot/chats/:chatId', { chatId }, {});

  try {
    bot.deleteChat(chatId);
  } catch {
    return res.status(404).json({ error: `Chat not found: ${chatId}` });
  }

  res.json({
    currentChatId: bot.currentChatId,
    currentAgentType: bot.currentAgentType,
  });
  logger.traceRet('DELETE /chatbot/chats/:chatId', { chatId, newCurrentChatId: bot.currentChatId });
}));

// POST /api/chatbot/message — send a message and get the reply. Optional chatId targets a
// chat directly (safe to call concurrently for different chats); omitting it uses "current chat".
router.post('/chatbot/message', withChatBot(async (bot, req, res) => {
  // A single agent.run() call (tool-calling through Ollama + a live search) can exceed the
  // server-wide socket timeout on its own (confirmed: a cars search hit ERR_EMPTY_RESPONSE
  // at ~130s). Disabled just for this request, so the global default still protects other routes.
  req.socket.setTimeout(0);

  const prompt = (req.body?.prompt ?? '').trim();
  const chatId = typeof req.body?.chatId === 'string' && req.body.chatId ? req.body.chatId : undefined;
  logger.traceCall('POST /chatbot/message', { chatId }, { prompt });

  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  try {
    const response = chatId ? await bot.getResponseForChat(chatId, prompt) : await bot.getResponse(prompt);
    res.json({ response });
    logger.traceRet('POST /chatbot/message', { chatId, responseLength: response.length });
  } catch (err) {
    if (err instanceof ChatBusyError) {
      return res.status(429).json({ error: 'This chat is already handling a request — please wait a moment and try again.' });
    }
    if (err instanceof OllamaBusyError) {
      return res.status(503).json({ error: 'The assistant is handling other requests — please try again shortly.' });
    }
    logger.error({ chatId, err }, 'POST /chatbot/message failed');
    res.status(502).json({ error: `Chat failed: ${err}` });
  }
}));

// POST /api/chatbot/files — upload a file for the agent to read
router.post('/chatbot/files', upload.single('file'), withChatBot(async (bot, req, res) => {
  const file = req.file;
  logger.traceCall('POST /chatbot/files', { filename: file?.originalname }, {});

  if (!file) {
    return res.status(400).json({ error: 'No file received.' });
  }

  const extension = path.extname(file.originalname).slice(1).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return res.status(400).json({
      error: `Unsupported file type '.${extension}'. Allowed: ${[...ALLOWED_EXTENSIONS].sort().join(', ')}.`,
    });
  }

  try {
    const response = await bot.uploadFile(file.path, file.originalname);
    res.json({ response });
    logger.traceRet('POST /chatbot/files', { filename: file.originalname, responseLength: response.length });
  } catch (err) {
    if (err instanceof ChatBusyError) {
      return res.status(429).json({ error: 'This chat is already handling a request — please wait a moment and try again.' });
    }
    if (err instanceof OllamaBusyError) {
      return res.status(503).json({ error: 'The assistant is handling other requests — please try again shortly.' });
    }
    throw err;
  }
}));

// GET /api/chatbot/files/:filename — download a file from the user's workspace
router.get('/chatbot/files/:filename', withChatBot((bot, req, res) => {
  const { filename } = req.params as { filename: string };
  logger.traceCall('GET /chatbot/files/:filename', { filename }, {});
  res.download(bot.downloadFilePath(filename), filename);
}));

export default router;
