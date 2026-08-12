import { Ollama, ChatResponse, Message } from 'ollama';
import { ToolRegistry } from './registry';
import { CallMetricsRepository } from '../repositories/call-metrics-repository';
import { runWithOllamaLimit } from './ollama-gate';
import config from '../config';

const callMetricsRepository = new CallMetricsRepository();

// A locally-constructed client (not the package's default singleton) so the host is
// configurable — 127.0.0.1 only reaches Ollama when it's running on the same machine as
// this process; Docker sets OLLAMA_HOST to reach the host machine's Ollama instead.
const ollama = new Ollama({ host: config.ollama.host });

/** Tags every metric this agent instance produces (ollama calls and the tool calls they
 *  trigger) with what it's for — set once at construction, not per-call. */
export interface AgentContext {
  label?: string;
  userId?: string;
  chatId?: string;
}

export interface AgentTrace {
  iteration: number;
  type: 'tool_call' | 'answer';
  tool?: string;
  args?: Record<string, any>;
  /** Truncated for logging */
  result?: string;
  /** The tool's untruncated return value */
  rawResult?: string;
  content?: string;
}

export interface AgentOptions {
  model?: string;
  registry: ToolRegistry;
  systemPrompt: string;
  numCtx?: number;
  maxIterations?: number;
  enableThinking?: boolean;
  verbose?: boolean;
  onSummary?: (summary: string) => void;
  context?: AgentContext;
}

/** Agent using Qwen3's native function-calling via Ollama's chat API. */
export class NativeToolAgent {
  
  private static readonly KEEP_RECENT = 3; // Number of messages to keep after summarising conversation
  private static readonly MAX_TOOL_RESULT_CHARS = 6000; // Tool results longer than this are truncated before being added to history

  private readonly model: string;
  private readonly registry: ToolRegistry;
  private readonly systemPrompt: string;
  private readonly numCtx: number;
  private readonly maxIterations: number;
  private readonly enableThinking: boolean;
  private readonly verbose: boolean;
  private readonly onSummary: ((summary: string) => void) | undefined;
  private readonly context: AgentContext;
  private messages: Message[] = [];

  constructor(options: AgentOptions) {
    this.model = options.model ?? 'qwen3:8b';
    this.registry = options.registry;
    this.systemPrompt = options.systemPrompt;
    this.numCtx = options.numCtx ?? 4096;
    this.maxIterations = options.maxIterations ?? 8;
    this.enableThinking = options.enableThinking ?? true;
    this.verbose = options.verbose ?? true;
    this.onSummary = options.onSummary;
    this.context = options.context ?? {};
  }

  private log(msg: string): void {
    if (this.verbose) console.log(msg);
  }

  private static formatMessage(message: Message): string {
    const role = message.role ?? '';
    let content = message.content ?? '';

    if (!content && message.tool_calls?.length) {
      const names = message.tool_calls.map(c => c.function.name).join(', ');
      content = `[tool_calls: ${names}]`;
    }

    const preview = content.slice(0, 50).replace(/\n/g, ' ');
    return `  [${role}] (${content.length} chars) '${preview}'`;
  }

  /** Best-effort performance/payload logging for one ollama.chat() call — never throws,
   *  never changes the caller's error handling (the caller still re-throws `error` itself). */
  private recordOllamaMetric(
    callType: 'ollama_chat' | 'ollama_summarize',
    durationMs: number,
    requestMessages: Message[],
    response: ChatResponse | null,
    error: unknown,
    hadToolCalls?: number,
  ): void {
    callMetricsRepository.record({
      callType,
      name: this.model,
      label: this.context.label ?? null,
      userId: this.context.userId ?? null,
      chatId: this.context.chatId ?? null,
      success: !!response,
      error: error ? String(error) : null,
      durationMs,
      promptTokens: response?.prompt_eval_count ?? null,
      completionTokens: response?.eval_count ?? null,
      loadDurationMs: response ? Math.round(response.load_duration / 1e6) : null,
      promptEvalDurationMs: response ? Math.round(response.prompt_eval_duration / 1e6) : null,
      evalDurationMs: response ? Math.round(response.eval_duration / 1e6) : null,
      hadToolCalls: hadToolCalls === undefined ? null : hadToolCalls > 0,
      requestPayload: requestMessages,
      responsePayload: response?.message?.content ?? null,
    });
  }

  /** Builds the system prompt from the configured persona and optional context */
  private buildSystemMessage(context: string = ''): Message {
    let content = this.systemPrompt;

    if (context) {
      content += `\n\n${context}`; // Context can be a file path just uploaded
    }

    return { role: 'system', content };
  }

  reset(): void {
    this.messages = [];
  }

  /** Sets conversation history from a summary string and filtered list of messages. */
  setMessageHistory(messages: Message[], summary?: string): void {
    this.log(`Setting message history with ${messages.length} messages and summary: ${summary}`);
    this.messages = [this.buildSystemMessage()];
    if (summary) {
      this.messages.push({ role: 'assistant', content: `[Summary of previous conversation]: ${summary}` });
    }
    this.messages.push(...messages);
  }

  refreshSystemMessage(context: string = ''): void {
    this.log(`Refreshing system message with context: ${context}`);
    const newSystem = this.buildSystemMessage(context);
    if (this.messages.length) {
      this.messages[0] = newSystem;
    } else {
      this.messages.push(newSystem);
    }
  }

  /** Execute the agent loop using native tool calling. */
  async run(query: string): Promise<[string, AgentTrace[]]> {
    this.messages.push({ role: 'user', content: query });

    const tools = this.registry.toOllamaTools();
    const trace: AgentTrace[] = [];

    this.log(`\nIn agent run: query: ${query}, max_iterations: ${this.maxIterations}`);

    for (let i = 1; i <= this.maxIterations; i++) {
      this.log(`\n${'='.repeat(60)}\n  ITERATION ${i}\n${'='.repeat(60)}`);

      this.log(`\n🗣️ Ollama chat, model: ${this.model} `);
      const chatStart = Date.now();
      let response;
      try {
        response = await runWithOllamaLimit(() => ollama.chat({
          model: this.model,
          messages: this.messages,
          tools: tools as any,
          think: this.enableThinking,
          options: { temperature: 0.1, num_ctx: this.numCtx },
        }));
      } catch (err) {
        this.recordOllamaMetric('ollama_chat', Date.now() - chatStart, this.messages, null, err);
        throw err;
      }
      const msg = response.message;
      this.recordOllamaMetric('ollama_chat', Date.now() - chatStart, this.messages, response, null, msg.tool_calls?.length);

      // Check context limit on every response
      if (this.isNearLimit()) {
        this.log('⚠️ Nearing context limit — compressing history');
        await this.summariseHistory();
      }

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        this.log(`\n✅ Final Answer: ${msg.content?.slice(0, 300)}`);
        trace.push({ iteration: i, type: 'answer', content: msg.content ?? '' });
        this.messages.push({ role: 'assistant', content: msg.content ?? '' });
        this.log('MESSAGES:\n' + this.messages.map(m => NativeToolAgent.formatMessage(m)).join('\n'));
        return [msg.content ?? '', trace];
      }

      this.messages.push(msg);

      for (const call of msg.tool_calls) {
        const fnName = call.function.name;
        const fnArgs = call.function.arguments as Record<string, any>;
        this.log(`\n🔧 Tool call: ${fnName}(${JSON.stringify(fnArgs)})`);

        const tool = this.registry.get(fnName);
        let result: string;

        if (!tool) {
          result = `Error: Unknown tool '${fnName}'`;
        } else {
          result = await tool.run(fnArgs, this.context);
        }

        if (result.length > NativeToolAgent.MAX_TOOL_RESULT_CHARS) {
          result = result.slice(0, NativeToolAgent.MAX_TOOL_RESULT_CHARS) + '\n... (truncated)';
        }

        this.log(`  👁️ Result: ${result.slice(0, 200)}`);

        this.messages.push({ role: 'tool', tool_name: fnName, content: result });

        trace.push({
          iteration: i,
          type: 'tool_call',
          tool: fnName,
          args: fnArgs,
          result: result.slice(0, 500),
          rawResult: result,
        });
      }
    }

    this.log(`\n⚠️ Max iterations (${this.maxIterations}) reached.`);
    return ['Reached step limit without a final answer.', trace];
  }

  /** Estimates context usage against the actual num_ctx allocated to this agent's calls, not
   *  the model's (much larger) trained max, which would let real usage silently overflow it.
   *  Ollama's prompt_eval_count is unreliable for total context size, so this estimates from chars. */
  private isNearLimit(threshold: number = 0.8): boolean {
    let totalChars = 0;
    for (const m of this.messages) {
      totalChars += (m.content ?? '').length;
    }

    // Conservative estimate
    const estimatedTokens = Math.floor(totalChars / 3);
    const limit = Math.floor(this.numCtx * threshold);

    this.log(`\n📏 Context usage — estimated_tokens:${estimatedTokens} threshold_limit:${limit}`);

    return estimatedTokens >= limit;
  }

  /** Summarise and replace current message history, keeping recent messages. */
  private async summariseHistory(): Promise<void> {
    // Exclude system prompt and recent messages from what gets summarised
    const messagesToSummarise =
      this.messages.length > NativeToolAgent.KEEP_RECENT + 1
        ? this.messages.slice(1, -NativeToolAgent.KEEP_RECENT)
        : [];

    if (messagesToSummarise.length === 0) {
      return; // not enough history
    }

    const summaryRequest: Message[] = [
      this.messages[0]!,
      ...messagesToSummarise,
      {
        role: 'user',
        content: 'Summarise the conversation so far concisely, preserving key facts, decisions, and tool results.',
      },
    ];

    const summarizeStart = Date.now();
    let response;
    try {
      response = await runWithOllamaLimit(() => ollama.chat({
        model: this.model,
        messages: summaryRequest,
        options: { num_ctx: this.numCtx },
      }));
    } catch (err) {
      this.recordOllamaMetric('ollama_summarize', Date.now() - summarizeStart, summaryRequest, null, err);
      throw err;
    }
    this.recordOllamaMetric('ollama_summarize', Date.now() - summarizeStart, summaryRequest, response, null);
    const summary = response.message.content;

    // let Chatbot know a summary was created so we can store it
    if (this.onSummary) {
      this.onSummary(summary);
    }

    // System prompt + summary + recent messages
    const systemMsg = this.messages[0]!;
    const recentMessages = this.messages.slice(-NativeToolAgent.KEEP_RECENT);
    this.messages = [
      systemMsg,
      { role: 'assistant', content: `[Summary of previous conversation]: ${summary}` },
      ...recentMessages,
    ];
  }
}
