import { getDb } from '../db';
import { createLogger } from '../logger';
import { CallMetricRecord } from '../model/call-metric';

const MAX_PAYLOAD_CHARS = 8000;
const logger = createLogger('call-metrics-repository');

// Raw row shape, snake_case straight from SQLite. Unlike every other repository's Row type,
// this one is exported: findSince() (below) skips the usual Row->domain-type conversion and
// hands rows straight to performance-report.ts, so this can't stay a private implementation detail.
export interface CallMetricRow {
  id: number;
  call_type: string;
  name: string;
  label: string | null;
  user_id: string | null;
  chat_id: string | null;
  success: number;
  error: string | null;
  duration_ms: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  load_duration_ms: number | null;
  prompt_eval_duration_ms: number | null;
  eval_duration_ms: number | null;
  had_tool_calls: number | null;
  request_payload: string | null;
  response_payload: string | null;
  created_at: string;
}

function truncate(value: unknown): string | null {
  if (value === undefined) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text.length <= MAX_PAYLOAD_CHARS) return text;
  return `${text.slice(0, MAX_PAYLOAD_CHARS)}\n... (truncated)`;
}

export class CallMetricsRepository {
  /** Best-effort: a metrics-write failure is logged, never thrown — must never break a real agent/tool call. */
  record(entry: CallMetricRecord): void {
    try {
      getDb().prepare(`
        INSERT INTO call_metrics (
          call_type, name, label, user_id, chat_id, success, error, duration_ms,
          prompt_tokens, completion_tokens, load_duration_ms, prompt_eval_duration_ms, eval_duration_ms,
          had_tool_calls, request_payload, response_payload, created_at
        ) VALUES (
          @call_type, @name, @label, @user_id, @chat_id, @success, @error, @duration_ms,
          @prompt_tokens, @completion_tokens, @load_duration_ms, @prompt_eval_duration_ms, @eval_duration_ms,
          @had_tool_calls, @request_payload, @response_payload, COALESCE(@created_at, datetime('now'))
        )
      `).run({
        call_type: entry.callType,
        name: entry.name,
        label: entry.label ?? null,
        user_id: entry.userId ?? null,
        chat_id: entry.chatId ?? null,
        success: entry.success ? 1 : 0,
        error: entry.error ?? null,
        duration_ms: entry.durationMs,
        prompt_tokens: entry.promptTokens ?? null,
        completion_tokens: entry.completionTokens ?? null,
        load_duration_ms: entry.loadDurationMs ?? null,
        prompt_eval_duration_ms: entry.promptEvalDurationMs ?? null,
        eval_duration_ms: entry.evalDurationMs ?? null,
        had_tool_calls: entry.hadToolCalls === undefined || entry.hadToolCalls === null ? null : (entry.hadToolCalls ? 1 : 0),
        request_payload: truncate(entry.requestPayload),
        response_payload: truncate(entry.responsePayload),
        created_at: entry.createdAt ?? null,
      });
    } catch (err) {
      logger.error({ err, callType: entry.callType, name: entry.name }, 'failed to record call metric');
    }
  }

  findSince(sinceIso: string | null): CallMetricRow[] {
    if (sinceIso) {
      return getDb()
        .prepare('SELECT * FROM call_metrics WHERE created_at >= ? ORDER BY created_at')
        .all(sinceIso) as CallMetricRow[];
    }
    return getDb().prepare('SELECT * FROM call_metrics ORDER BY created_at').all() as CallMetricRow[];
  }
}
