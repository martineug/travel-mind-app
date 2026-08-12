import { CallMetricsRepository } from '../repositories/call-metrics-repository';

export interface ToolParameter {
  type: string;
  description: string;
  // JSON-Schema array item shape, for a parameter of type 'array' whose entries are objects
  // — passed straight through to Ollama's schema by toOllamaSchema().
  items?: { type: string; properties?: Record<string, ToolParameter>; required?: string[] };
}

export interface ToolParameters {
  [key: string]: ToolParameter;
}

/** Structurally the same shape as agent.ts's AgentContext — kept as its own type here
 *  (rather than imported) so tool.ts doesn't need a dependency on agent.ts. */
export interface ToolCallContext {
  label?: string;
  userId?: string;
  chatId?: string;
}

const callMetricsRepository = new CallMetricsRepository();

export class Tool {
  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly parameters: ToolParameters,
    private readonly fn: (args: Record<string, any>) => string | Promise<string>,
  ) {}

  async run(args: Record<string, any>, context: ToolCallContext = {}): Promise<string> {
    const start = Date.now();

    try {
      const result = String(await this.fn(args));
      this.recordMetric(start, args, result, true, context);
      return result;
    } catch (e) {
      const result = `Error running ${this.name}: ${e}`;
      this.recordMetric(start, args, result, false, context);
      return result;
    }
  }

  private recordMetric(start: number, args: Record<string, any>, result: string, success: boolean, context: ToolCallContext): void {
    callMetricsRepository.record({
      callType: 'tool_call',
      name: this.name,
      label: context.label ?? null,
      userId: context.userId ?? null,
      chatId: context.chatId ?? null,
      success,
      error: success ? null : result,
      durationMs: Date.now() - start,
      requestPayload: args,
      responsePayload: result,
    });
  }

  toOllamaSchema(): object {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          required: Object.keys(this.parameters),
          properties: this.parameters,
        },
      },
    };
  }
}
