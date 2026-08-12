export interface CallMetricRecord {
  callType: 'ollama_chat' | 'ollama_summarize' | 'tool_call';
  name: string;
  label?: string | null;
  userId?: string | null;
  chatId?: string | null;
  success: boolean;
  error?: string | null;
  durationMs: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  loadDurationMs?: number | null;
  promptEvalDurationMs?: number | null;
  evalDurationMs?: number | null;
  hadToolCalls?: boolean | null;
  requestPayload?: unknown;
  responsePayload?: unknown;
  createdAt?: string;
}
