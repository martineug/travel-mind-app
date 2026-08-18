import { NativeToolAgent, AgentTrace } from '../../agent/agent';
import { ToolRegistry } from '../../agent/registry';
import { parseAgentJson } from '../../agent/parse-agent-json';
import { calculatorTool } from '../../agent/tools/calculator-tool';
import { flightSearchTool } from '../../agent/tools/flight-search';
import { staySearchTool } from '../../agent/tools/stay-search';
import { carSearchTool } from '../../agent/tools/car-search';
import { makeListFilesTool } from '../../agent/tools/file-lister';
import { makeReadFileTool } from '../../agent/tools/file-reader';
import { makeWriteFileTool } from '../../agent/tools/file-writer';
import { makeSaveMemoryTool } from '../../agent/tools/save-memory';
import { pdfExtractTool } from '../../agent/tools/pdf-extract';
import { makeGenerateItineraryPdfTool } from '../../agent/tools/itinerary-pdf';
import { webSearchTool } from '../../agent/tools/web-search';
import { wikipediaTool } from '../../agent/tools/wikipedia';
import { AGENT_SYSTEM_PROMPTS, buildTodayContext } from '../../agent/prompts';
import { WizardAnswer } from '../../model/wizard-question';
import { ChatMessageRepository } from '../../repositories/chat-message-repository';
import { ChatSummaryRepository } from '../../repositories/chat-summary-repository';
import { UserProfileRepository } from '../../repositories/user-profile-repository';
import { ChatSession } from '../../model/chat-session';
import { ChatMessage } from '../../model/chat-message';
import { AgentType } from '../../model/agent-type';
import { FileService } from '../file/file-service';
import { MemoryService } from './memory-service';
import { TripService } from '../trip/trip-service';
import { createLogger } from '../../logger';
import config from '../../config';

const logger = createLogger('chatbot-service');

export interface ChatPreview {
  id: string;
  preview: string;
  agentType: AgentType;
}

function buildGeneralRegistry(
  fileService: FileService,
  memoryService: MemoryService,
  tripService: TripService,
  tripId: string,
): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(calculatorTool);
  registry.register(makeReadFileTool(fileService));
  registry.register(makeWriteFileTool(fileService));
  registry.register(makeListFilesTool(fileService));
  registry.register(makeSaveMemoryTool(memoryService));
  registry.register(pdfExtractTool);
  registry.register(makeGenerateItineraryPdfTool(tripId, fileService, tripService));
  registry.register(webSearchTool);
  registry.register(wikipediaTool);

  return registry;
}

function buildDomainRegistry(
  agentType: AgentType,
  fileService: FileService,
  memoryService: MemoryService,
  tripService: TripService,
  tripId: string,
): ToolRegistry {
  const registry = buildGeneralRegistry(fileService, memoryService, tripService, tripId);

  // Search only — no booking tools. Every vertical books from the UI's person picker
  // (POST /flights/bookings/initiate, /cars/bookings, /stays/bookings), so traveller/payment
  // data never pass through the model — no code path exists for it to book anything.
  if (agentType === 'flights') registry.register(flightSearchTool);
  if (agentType === 'stays') registry.register(staySearchTool);
  if (agentType === 'cars') registry.register(carSearchTool);

  return registry;
}

function buildMemoriesContext(memoryService: MemoryService): string {
  const memories = memoryService.readMemories();

  if (memories.length === 0) {
    return '';
  }

  return `What you know about the user:\n${memories.map(m => `- ${m.memory}`).join('\n')}`;
}

function buildContext(memoryService: MemoryService): string {
  return [buildTodayContext(), buildMemoriesContext(memoryService)].filter(Boolean).join('\n\n');
}

// Which response key each search tool's results belong under — assembled from the tool's own
// trace, not asked of or trusted to the model (Duffel offer/rate IDs must stay exact).
const SEARCH_RESULT_KEY: Record<string, string> = {
  flight_search: 'flights',
  stay_search:   'stays',
  car_search:    'cars',
};

/** Attaches a search tool's real result array from this turn's trace, deriving action:"search"
 *  from the trace itself rather than the model's claim. Returns whether it mutated `parsed`. */
function attachSearchFromTrace(parsed: Record<string, unknown>, trace: AgentTrace[]): boolean {
  const searchCall = [...trace].reverse().find(t => t.type === 'tool_call' && !!t.tool && !!SEARCH_RESULT_KEY[t.tool]);
  if (!searchCall?.rawResult || !searchCall.tool) return false;

  let results: unknown;
  try { results = JSON.parse(searchCall.rawResult); } catch { return false; }
  if (!Array.isArray(results)) return false;

  parsed[SEARCH_RESULT_KEY[searchCall.tool]!] = results;
  parsed.action = 'search';
  return true;
}

// Tools whose result is a {filename, url} download link — the model can't be trusted to
// echo a URL verbatim, so it's attached from the tool's own raw result, same remedy as
// search/payment fields above. Not action-gated: a file can be generated during an ordinary
// "chat"-action turn (e.g. "here's your PDF"), unlike search/payment which are their own actions.
const FILE_TOOL_NAMES = new Set(['generate_itinerary_pdf', 'write_file']);

/** Attaches parsed.file = {name, url} from the most recent file-producing tool call in the
 *  trace, if any. Returns whether it mutated `parsed`, so the caller knows to re-stringify. */
function attachFileFromTrace(parsed: Record<string, unknown>, trace: AgentTrace[]): boolean {
  const fileCall = [...trace].reverse().find(t => t.type === 'tool_call' && !!t.tool && FILE_TOOL_NAMES.has(t.tool));
  if (!fileCall?.rawResult) return false;

  const result = parseAgentJson<Record<string, unknown>>(fileCall.rawResult);
  if (typeof result?.filename !== 'string' || typeof result?.url !== 'string') return false;

  parsed.file = { name: result.filename, url: result.url };
  return true;
}

/** Attaches parsed.files = [{name, url}, ...] from the most recent list_files call in the
 *  trace, if any — same reasoning as attachFileFromTrace, but plural since a listing can
 *  legitimately contain more than one file. Returns whether it mutated `parsed`. */
function attachFilesFromTrace(parsed: Record<string, unknown>, trace: AgentTrace[]): boolean {
  const listCall = [...trace].reverse().find(t => t.type === 'tool_call' && t.tool === 'list_files');
  if (!listCall?.rawResult) return false;

  let results: unknown;
  try { results = JSON.parse(listCall.rawResult); } catch { return false; }
  if (!Array.isArray(results)) return false;

  const files = results.filter(
    (r): r is { filename: string; url: string } =>
      !!r && typeof r.filename === 'string' && typeof r.url === 'string',
  );

  parsed.files = files.map(f => ({ name: f.filename, url: f.url }));
  return true;
}

/** Attaches parsed.sources = [{title, url}, ...] from the most recent web_search call in the
 *  trace, if any — same reasoning as attachFileFromTrace/attachFilesFromTrace: the model can't
 *  be trusted to transcribe a URL into "message" without mangling or inventing one. Returns
 *  whether it mutated `parsed`. */
function attachSourcesFromTrace(parsed: Record<string, unknown>, trace: AgentTrace[]): boolean {
  const searchCall = [...trace].reverse().find(t => t.type === 'tool_call' && t.tool === 'web_search');
  if (!searchCall?.rawResult) return false;

  let results: unknown;
  try { results = JSON.parse(searchCall.rawResult); } catch { return false; }
  if (!Array.isArray(results)) return false;

  const sources = results.filter(
    (r): r is { title: string; url: string } =>
      !!r && typeof r.title === 'string' && typeof r.url === 'string',
  );

  parsed.sources = sources.map(s => ({ title: s.title, url: s.url }));
  return true;
}

// Deliberately narrow — only the word the prompt's own "ready to download" example uses
// (prompts.ts's FILE_TOOL_GUIDANCE) — so an unrelated reply never gets a file misattached to it.
const FILE_READY_RE = /\bdownload\b/i;

const FILE_CLAIM_GROUNDING_TOOLS = new Set([...FILE_TOOL_NAMES, 'list_files']);

/** verifyFinalAnswer hook: rejects a "file is ready/downloadable" claim with no matching tool
 *  call this turn, giving the model one chance to correct itself — see prompts.ts's
 *  FILE_TOOL_GUIDANCE, which already tells it not to do this. */
function verifyFileClaimGrounded(content: string, trace: AgentTrace[]): string | null {
  if (!FILE_READY_RE.test(content)) return null;

  const grounded = trace.some(t => t.type === 'tool_call' && !!t.tool && FILE_CLAIM_GROUNDING_TOOLS.has(t.tool));
  if (grounded) return null;

  return 'You just said something implying a file is ready or available to download, but you did not call generate_itinerary_pdf, write_file, or list_files this turn. Call the right tool now to make that true, or rewrite your reply without claiming a file is ready.';
}

/** Assembles the client-facing response from this turn's tool trace — search results, file
 *  links — since offer/rate IDs and URLs must be exact and can't be trusted to the model's
 *  own transcription. Falls back to the model's raw text if nothing attaches. */
function assembleAuthoritativeResponse(answer: string, trace: AgentTrace[]): string {
  const parsed = parseAgentJson<Record<string, unknown>>(answer) ?? { action: 'chat', message: answer };

  const searchAttached = attachSearchFromTrace(parsed, trace);
  const fileAttached = attachFileFromTrace(parsed, trace);
  const filesAttached = attachFilesFromTrace(parsed, trace);
  const sourcesAttached = attachSourcesFromTrace(parsed, trace);

  return (searchAttached || fileAttached || filesAttached || sourcesAttached) ? JSON.stringify(parsed) : answer;
}

/** Thrown by ChatBotService.withChatLock when a chat already has MAX_CHAT_QUEUE_DEPTH requests
 *  in flight/queued — see that method's doc comment for why this exists. */
export class ChatBusyError extends Error {
  constructor(public readonly chatId: string) {
    super(`Chat ${chatId} already has too many requests in progress`);
  }
}

export class ChatBotService {
  private readonly chatMessageRepository: ChatMessageRepository;
  private readonly chatSummaryRepository: ChatSummaryRepository;
  private readonly userProfileRepository: UserProfileRepository;
  private readonly tripService: TripService;
  private readonly memoryService: MemoryService;
  private readonly fileService: FileService;
  /** Keyed by chat id — one NativeToolAgent per chat, lazily built, so chats never share
   *  mutable conversation state and can be processed concurrently (see getOrBuildAgentForChat).
   */
  private readonly agentCache = new Map<string, { agent: NativeToolAgent; lastAccess: number }>();
  /** Per-chat serialization for getResponseForChat/uploadFileForChat — see withChatLock. */
  private readonly chatLocks = new Map<string, Promise<void>>();
  private readonly chatQueueDepth = new Map<string, number>();
  private static readonly MAX_CHAT_QUEUE_DEPTH = 3;
  private chat: ChatSession;
  private tripId: string;

  constructor(
    private readonly userId: string,
    private readonly model: string = config.ollama.model,
    private readonly verbose: boolean = config.ollama.verbose,
  ) {
    this.chatMessageRepository = new ChatMessageRepository(userId);
    this.chatSummaryRepository = new ChatSummaryRepository(userId);
    this.userProfileRepository = new UserProfileRepository();
    this.tripService = new TripService(userId);
    this.memoryService = new MemoryService(userId);
    this.fileService = new FileService(userId);

    this.tripId = this.tripService.getCurrentTripId();
    const profile = this.userProfileRepository.findByUserId(userId);
    const savedSession = profile?.currentSessionId
      ? this.chatMessageRepository.findById(profile.currentSessionId)
      : null;
    this.chat = savedSession
      ?? this.chatMessageRepository.findLatest(this.tripId)
      ?? this.chatMessageRepository.create(this.tripId, 'flights');
    this.userProfileRepository.updateCurrentSession(userId, this.chat.id);
  }

  /** Deletes agentCache entries idle past the TTL. */
  private sweepAgentCache(): void {
    const cutoff = Date.now() - config.session.idleTtlMs;
    for (const [chatId, entry] of this.agentCache) {
      if (entry.lastAccess < cutoff) {
        this.agentCache.delete(chatId);
      }
    }
  }

  /** Serializes calls for the same chatId. */
  private async withChatLock<T>(chatId: string, fn: () => Promise<T>): Promise<T> {
    const depth = this.chatQueueDepth.get(chatId) ?? 0;
    if (depth >= ChatBotService.MAX_CHAT_QUEUE_DEPTH) {
      throw new ChatBusyError(chatId);
    }
    this.chatQueueDepth.set(chatId, depth + 1);

    const prior = this.chatLocks.get(chatId) ?? Promise.resolve();
    const run = prior.then(fn);
    // Swallow so a failed turn doesn't wedge the next one waiting behind it — the real error
    // still propagates to this call's own caller via `run` below.
    const settled = run.then(() => undefined, () => undefined);
    this.chatLocks.set(chatId, settled);

    try {
      return await run;
    } finally {
      const remaining = (this.chatQueueDepth.get(chatId) ?? 1) - 1;
      if (remaining <= 0) {
        this.chatQueueDepth.delete(chatId);
      } else {
        this.chatQueueDepth.set(chatId, remaining);
      }
      if (this.chatLocks.get(chatId) === settled) {
        this.chatLocks.delete(chatId);
      }
    }
  }

  /** Builds (or reuses) the NativeToolAgent for one chat. Closes over that chat's own fixed
   *  tripId/id rather than this service's mutable "current" pointers, so a slow in-flight
   *  run can never have its writes misattributed to whatever's "current" by the time it resolves. */
  private getOrBuildAgentForChat(chat: ChatSession): NativeToolAgent {
    this.sweepAgentCache();

    const cached = this.agentCache.get(chat.id);
    if (cached) {
      cached.lastAccess = Date.now();
      return cached.agent;
    }

    const chatId = chat.id;
    const tripId = chat.tripId;

    const onSummary = (summary: string): void => {
      if (this.chatSummaryRepository.findByChatId(chatId)) {
        this.chatSummaryRepository.update(chatId, summary);
      } else {
        this.chatSummaryRepository.create(chatId, summary);
      }
    };

    const agent = new NativeToolAgent({
      model: this.model,
      registry: buildDomainRegistry(chat.agentType, this.fileService, this.memoryService, this.tripService, tripId),
      systemPrompt: AGENT_SYSTEM_PROMPTS[chat.agentType],
      numCtx: config.ollama.numCtx,
      maxIterations: config.ollama.maxIterations,
      enableThinking: config.ollama.enableThinking,
      verbose: this.verbose,
      onSummary,
      context: { label: chat.agentType, userId: this.userId, chatId },
      verifyFinalAnswer: verifyFileClaimGrounded,
    });

    this.loadAgentHistoryInto(agent, chat);
    this.agentCache.set(chatId, { agent, lastAccess: Date.now() });
    return agent;
  }

  get currentChatId(): string {
    return this.chat.id;
  }

  get currentTripId(): string {
    return this.tripId;
  }

  get currentAgentType(): AgentType {
    return this.chat.agentType;
  }

  newChat(agentType: AgentType, answers?: Record<string, WizardAnswer>): void {
    logger.debugInfoCall('newChat', { agentType }, { userId: this.userId, hasAnswers: !!answers });
    this.chat = this.chatMessageRepository.create(this.tripId, agentType, answers);
    this.userProfileRepository.updateCurrentSession(this.userId, this.chat.id);
    logger.debugInfoRet('newChat', { chatId: this.chat.id });
  }


  deleteChat(chatId: string): void {
    logger.debugInfoCall('deleteChat', { chatId }, { userId: this.userId });

    const chat = this.chatMessageRepository.findById(chatId);

    if (!chat) {
      logger.error({ chatId }, 'deleteChat: chat not found');
      throw new Error(`Chat not found: ${chatId}`);
    }

    const wasActive = chat.id === this.chat.id;

    this.chatMessageRepository.delete(chatId);
    this.agentCache.delete(chatId);

    if (wasActive) {
      this.chat = this.chatMessageRepository.findLatest(this.tripId) ?? this.chatMessageRepository.create(this.tripId, 'flights');
      this.userProfileRepository.updateCurrentSession(this.userId, this.chat.id);
    }

    logger.debugInfoRet('deleteChat', { chatId, wasActive });
  }

  switchChat(chatId: string): void {
    logger.debugInfoCall('switchChat', { chatId }, { userId: this.userId });

    const chat = this.chatMessageRepository.findById(chatId);

    if (!chat) {
      logger.error({ chatId }, 'switchChat: chat not found');
      throw new Error(`Chat not found: ${chatId}`);
    }

    this.chat = chat;
    this.userProfileRepository.updateCurrentSession(this.userId, chat.id);
    logger.debugInfoRet('switchChat', { chatId });
  }

  switchTrip(tripId: string): void {
    logger.debugInfoCall('switchTrip', { tripId }, { userId: this.userId });

    this.tripService.switchTrip(tripId);

    this.tripId = tripId;
    this.chat = this.chatMessageRepository.findLatest(tripId) ?? this.chatMessageRepository.create(tripId, 'flights');
    this.userProfileRepository.updateCurrentSession(this.userId, this.chat.id);

    logger.debugInfoRet('switchTrip', { tripId, chatId: this.chat.id });
  }

  private loadAgentHistoryInto(agent: NativeToolAgent, chat: ChatSession): void {
    const chatSummary = this.chatSummaryRepository.findByChatId(chat.id);
    let messages = chat.messages;

    if (chatSummary) {
      // only include messages after summary was created
      messages = messages.filter(m => m.createdAt > chatSummary.createdAt);
    }

    agent.setMessageHistory(
      messages.map(m => ({ role: m.role, content: m.content })),
      chatSummary?.summary,
    );
  }

  async uploadFileForChat(chatId: string, filepath: string, filename: string): Promise<string> {
    return this.withChatLock(chatId, () => this.doUploadFileForChat(chatId, filepath, filename));
  }

  private async doUploadFileForChat(chatId: string, filepath: string, filename: string): Promise<string> {
    logger.debugInfoCall('uploadFileForChat', { chatId, filename }, { userId: this.userId, filepath });

    const chat = this.chatMessageRepository.findById(chatId);
    if (!chat) {
      logger.error({ chatId }, 'uploadFileForChat: chat not found');
      throw new Error(`Chat not found: ${chatId}`);
    }

    this.chatMessageRepository.createMessage(chatId, 'user', `[File uploaded: ${filename}]`);

    const agent = this.getOrBuildAgentForChat(chat);
    agent.refreshSystemMessage(buildContext(this.memoryService));

    const [answer] = await agent.run(
      `The user uploaded '${filename}' at path '${filepath}'. Read it using the read_uploaded_pdf tool.`,
    );

    this.chatMessageRepository.createMessage(chatId, 'assistant', answer);

    logger.debugInfoRet('uploadFileForChat', { chatId, answerLength: answer.length });
    return answer;
  }

  async uploadFile(filepath: string, filename: string): Promise<string> {
    return this.uploadFileForChat(this.chat.id, filepath, filename);
  }

  downloadFilePath(filename: string): string {
    logger.debugInfoCall('downloadFilePath', { filename }, { userId: this.userId });
    const resolvedPath = this.fileService.resolvePath(filename);
    logger.debugInfoRet('downloadFilePath', { resolvedPath });
    return resolvedPath;
  }

  /** Parallel-safe: never touches this.chat/this.tripId, so concurrent calls for different
   *  chatIds run independently. Concurrent calls for the *same* chatId are serialized via
   *  withChatLock rather than run in parallel — see that method's doc comment. Never throws on
   *  an agent-run failure — persists the user's message plus a fallback reply instead; still
   *  throws if chatId is unknown, or if withChatLock rejects with ChatBusyError. */
  async getResponseForChat(chatId: string, userMessage: string): Promise<string> {
    return this.withChatLock(chatId, () => this.doGetResponseForChat(chatId, userMessage));
  }

  private async doGetResponseForChat(chatId: string, userMessage: string): Promise<string> {
    logger.debugInfoCall('getResponseForChat', { chatId }, { userId: this.userId, userMessage });

    const chat = this.chatMessageRepository.findById(chatId);
    if (!chat) {
      logger.error({ chatId }, 'getResponseForChat: chat not found');
      throw new Error(`Chat not found: ${chatId}`);
    }

    const agent = this.getOrBuildAgentForChat(chat);
    agent.refreshSystemMessage(buildContext(this.memoryService));

    let answer: string;
    try {
      const [modelAnswer, trace] = await agent.run(userMessage);
      answer = assembleAuthoritativeResponse(modelAnswer, trace);
    } catch (err) {
      logger.error({ chatId, err }, 'getResponseForChat: agent run failed');
      answer = JSON.stringify({ action: 'chat', message: "Sorry, I couldn't complete that — please try asking me again in this chat." });
    }

    this.chatMessageRepository.createMessage(chatId, 'user', userMessage);
    this.chatMessageRepository.createMessage(chatId, 'assistant', answer);

    logger.debugInfoRet('getResponseForChat', { chatId, answerLength: answer.length });
    return answer;
  }

  async getResponse(userMessage: string): Promise<string> {
    return this.getResponseForChat(this.chat.id, userMessage);
  }

  /** Records the payment sheet was dismissed by appending a plain assistant note — the point
   *  is the append itself, since chat-panel reopens the sheet whenever a chat's last message
   *  is an unpaid action:"payment". Returns false if chatId doesn't resolve, for a 404. */
  cancelPayment(chatId: string): boolean {
    logger.debugInfoCall('cancelPayment', { chatId }, { userId: this.userId });

    if (!this.chatMessageRepository.findById(chatId)) {
      logger.debugInfoRet('cancelPayment', { chatId, found: false });
      return false;
    }

    this.chatMessageRepository.createMessage(chatId, 'assistant', JSON.stringify({
      action: 'chat',
      message: "Payment cancelled. Let me know if you'd like to try a different flight.",
    }));

    logger.debugInfoRet('cancelPayment', { chatId, found: true });
    return true;
  }

  getChatMessages(): ChatMessage[] {
    logger.debugInfoCall('getChatMessages', {}, { userId: this.userId, chatId: this.chat.id });
    const messages = this.chatMessageRepository.findById(this.chat.id)?.messages ?? [];
    logger.debugInfoRet('getChatMessages', { count: messages.length });
    return messages;
  }

  getAllChats(): ChatPreview[] {
    logger.debugInfoCall('getAllChats', {}, { userId: this.userId, tripId: this.tripId });
    const chats = this.chatMessageRepository.findAll(this.tripId).map(session => ({
      id: session.id,
      agentType: session.agentType,
      preview: session.messages[0] ? session.messages[0].content.slice(0, 60) : '(empty)',
    }));
    logger.debugInfoRet('getAllChats', { count: chats.length });
    return chats;
  }

  reorderChats(chatIds: string[]): void {
    logger.debugInfoCall('reorderChats', { chatIds }, { userId: this.userId });
    this.chatMessageRepository.reorder(this.tripId, chatIds);
    logger.debugInfoRet('reorderChats', { count: chatIds.length });
  }
}
