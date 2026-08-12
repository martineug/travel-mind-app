import '../config';
import fs from 'fs';
import path from 'path';
import { CallMetricsRepository, CallMetricRow } from '../repositories/call-metrics-repository';
import { toSqliteDatetime } from '../utils/sqlite-datetime';

interface Args {
  since: string | null;
  out: string;
}

function parseArgs(): Args {
  let since: string | null = null;
  let out = 'performance-report.html';

  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'since' && value) since = value;
    if (key === 'out' && value) out = value;
  }

  return { since, out };
}

/** Converts a "30m" / "24h" / "7d" duration into a datetime bound suitable for comparing
 *  against `created_at` (see toSqliteDatetime). */
function parseSinceArg(duration: string): string | null {
  const match = duration.match(/^(\d+)(m|h|d)$/);
  if (!match) {
    console.error(`Unrecognized --since value "${duration}" (expected e.g. 30m, 24h, 7d) — ignoring, using all-time.`);
    return null;
  }

  const amount = Number(match[1]);
  const unitMs = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 'm' | 'h' | 'd'];
  return toSqliteDatetime(new Date(Date.now() - amount * unitMs));
}

interface DurationStats {
  count: number;
  successCount: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
}

function computeDurationStats(rows: CallMetricRow[]): DurationStats {
  const durations = rows.map(r => r.duration_ms).sort((a, b) => a - b);
  const successCount = rows.filter(r => r.success === 1).length;

  if (durations.length === 0) {
    return { count: 0, successCount: 0, avgMs: 0, p95Ms: 0, maxMs: 0 };
  }

  const avgMs = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  const p95Index = Math.min(durations.length - 1, Math.max(0, Math.ceil(0.95 * durations.length) - 1));

  return {
    count: durations.length,
    successCount,
    avgMs: Math.round(avgMs),
    p95Ms: durations[p95Index]!,
    maxMs: durations[durations.length - 1]!,
  };
}

interface MinuteBucket {
  minute: string;
  count: number;
  avgMs: number;
}

function computeMinuteBuckets(rows: CallMetricRow[]): MinuteBucket[] {
  const buckets = new Map<string, { count: number; totalMs: number }>();

  for (const row of rows) {
    const minute = row.created_at.slice(0, 16); // 'YYYY-MM-DD HH:MM'
    const bucket = buckets.get(minute) ?? { count: 0, totalMs: 0 };
    bucket.count += 1;
    bucket.totalMs += row.duration_ms;
    buckets.set(minute, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([minute, { count, totalMs }]) => ({ minute, count, avgMs: Math.round(totalMs / count) }));
}

interface BreakdownRow {
  callType: string;
  name: string;
  label: string;
  count: number;
  successRate: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  avgPromptTokens: number | null;
  avgCompletionTokens: number | null;
  avgTokensPerSec: number | null;
}

function computeBreakdown(rows: CallMetricRow[]): BreakdownRow[] {
  const groups = new Map<string, CallMetricRow[]>();

  for (const row of rows) {
    const key = `${row.call_type}::${row.name}::${row.label ?? ''}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const result: BreakdownRow[] = [];
  for (const group of groups.values()) {
    const stats = computeDurationStats(group);
    const promptTokenRows = group.filter(r => r.prompt_tokens !== null);
    const completionTokenRows = group.filter(r => r.completion_tokens !== null);
    const tokensPerSecValues = group
      .filter(r => r.completion_tokens !== null && r.eval_duration_ms !== null && r.eval_duration_ms > 0)
      .map(r => r.completion_tokens! / (r.eval_duration_ms! / 1000));

    result.push({
      callType: group[0]!.call_type,
      name: group[0]!.name,
      label: group[0]!.label ?? '—',
      count: stats.count,
      successRate: stats.count === 0 ? 0 : Math.round((stats.successCount / stats.count) * 100),
      avgMs: stats.avgMs,
      p95Ms: stats.p95Ms,
      maxMs: stats.maxMs,
      avgPromptTokens: promptTokenRows.length
        ? Math.round(promptTokenRows.reduce((s, r) => s + r.prompt_tokens!, 0) / promptTokenRows.length)
        : null,
      avgCompletionTokens: completionTokenRows.length
        ? Math.round(completionTokenRows.reduce((s, r) => s + r.completion_tokens!, 0) / completionTokenRows.length)
        : null,
      avgTokensPerSec: tokensPerSecValues.length
        ? Math.round((tokensPerSecValues.reduce((s, v) => s + v, 0) / tokensPerSecValues.length) * 10) / 10
        : null,
    });
  }

  return result.sort((a, b) => b.count - a.count);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function preview(text: string | null, max = 160): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function renderHtml(rows: CallMetricRow[]): string {
  const summary = computeDurationStats(rows);
  const minuteBuckets = computeMinuteBuckets(rows);
  const breakdown = computeBreakdown(rows);
  const recentCalls = [...rows].reverse().slice(0, 50);
  const recentFailures = [...rows].filter(r => r.success === 0).reverse().slice(0, 20);
  const dateRange = rows.length ? `${rows[0]!.created_at} – ${rows[rows.length - 1]!.created_at}` : '—';

  const chartData = {
    labels: minuteBuckets.map(b => b.minute),
    callsPerMinute: minuteBuckets.map(b => b.count),
    avgMsPerMinute: minuteBuckets.map(b => b.avgMs),
  };

  const breakdownRowsHtml = breakdown.map(b => `
    <tr>
      <td>${escapeHtml(b.callType)}</td>
      <td>${escapeHtml(b.name)}</td>
      <td>${escapeHtml(b.label)}</td>
      <td>${b.count}</td>
      <td>${b.successRate}%</td>
      <td>${b.avgMs}</td>
      <td>${b.p95Ms}</td>
      <td>${b.maxMs}</td>
      <td>${b.avgPromptTokens ?? '—'}</td>
      <td>${b.avgCompletionTokens ?? '—'}</td>
      <td>${b.avgTokensPerSec ?? '—'}</td>
    </tr>`).join('');

  const recentCallsHtml = recentCalls.map(r => `
    <tr>
      <td>${escapeHtml(r.created_at)}</td>
      <td>${escapeHtml(r.call_type)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.label ?? '—')}</td>
      <td>${r.duration_ms}</td>
      <td>${r.success ? '✓' : '✗'}</td>
      <td>
        <details>
          <summary>${escapeHtml(preview(r.request_payload))}</summary>
          <pre>${escapeHtml(r.request_payload ?? '')}</pre>
        </details>
      </td>
      <td>
        <details>
          <summary>${escapeHtml(preview(r.response_payload))}</summary>
          <pre>${escapeHtml(r.response_payload ?? '')}</pre>
        </details>
      </td>
    </tr>`).join('');

  const failuresHtml = recentFailures.map(r => `
    <tr>
      <td>${escapeHtml(r.created_at)}</td>
      <td>${escapeHtml(r.call_type)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.label ?? '—')}</td>
      <td>${escapeHtml(r.error ?? '')}</td>
    </tr>`).join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Ollama / tool call performance report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; background: #0f1115; color: #e4e6eb; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 32px 0 12px; color: #9aa4b2; text-transform: uppercase; letter-spacing: 0.04em; }
  .subtitle { color: #7a8494; font-size: 13px; margin-bottom: 24px; }
  .cards { display: flex; gap: 12px; flex-wrap: wrap; }
  .card { background: #171a21; border: 1px solid #262b36; border-radius: 8px; padding: 14px 18px; min-width: 140px; }
  .card .value { font-size: 22px; font-weight: 600; }
  .card .label { font-size: 12px; color: #7a8494; margin-top: 2px; }
  .chart-wrap { background: #171a21; border: 1px solid #262b36; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  canvas { max-height: 220px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; background: #171a21; border: 1px solid #262b36; border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #262b36; vertical-align: top; }
  th { color: #9aa4b2; font-weight: 500; background: #12141a; }
  tr:last-child td { border-bottom: none; }
  details summary { cursor: pointer; color: #7a8494; }
  pre { white-space: pre-wrap; word-break: break-word; font-size: 11px; color: #c3c9d4; max-width: 480px; }
  .empty { color: #7a8494; padding: 40px; text-align: center; }
</style>
</head>
<body>
  <h1>Ollama / tool call performance report</h1>
  <div class="subtitle">${rows.length} calls · ${dateRange}</div>

  ${rows.length === 0 ? '<div class="empty">No call_metrics rows yet — use the app for a bit, then re-run this report.</div>' : `
  <div class="cards">
    <div class="card"><div class="value">${summary.count}</div><div class="label">Total calls</div></div>
    <div class="card"><div class="value">${summary.count ? Math.round((summary.successCount / summary.count) * 100) : 0}%</div><div class="label">Success rate</div></div>
    <div class="card"><div class="value">${summary.avgMs} ms</div><div class="label">Avg duration</div></div>
    <div class="card"><div class="value">${summary.p95Ms} ms</div><div class="label">p95 duration</div></div>
    <div class="card"><div class="value">${summary.maxMs} ms</div><div class="label">Max duration</div></div>
  </div>

  <h2>Calls per minute</h2>
  <div class="chart-wrap"><canvas id="callsChart"></canvas></div>

  <h2>Average processing time per minute</h2>
  <div class="chart-wrap"><canvas id="durationChart"></canvas></div>

  <h2>Breakdown by call type / name / label</h2>
  <table>
    <thead><tr>
      <th>Type</th><th>Name</th><th>Label</th><th>Count</th><th>Success</th>
      <th>Avg ms</th><th>p95 ms</th><th>Max ms</th>
      <th>Avg prompt tok</th><th>Avg completion tok</th><th>Avg tok/s</th>
    </tr></thead>
    <tbody>${breakdownRowsHtml}</tbody>
  </table>

  <h2>Recent calls (last ${recentCalls.length})</h2>
  <table>
    <thead><tr><th>Time</th><th>Type</th><th>Name</th><th>Label</th><th>ms</th><th>OK</th><th>Request</th><th>Response</th></tr></thead>
    <tbody>${recentCallsHtml}</tbody>
  </table>

  <h2>Recent failures (last ${recentFailures.length})</h2>
  <table>
    <thead><tr><th>Time</th><th>Type</th><th>Name</th><th>Label</th><th>Error</th></tr></thead>
    <tbody>${failuresHtml || '<tr><td colspan="5" class="empty">No failures recorded</td></tr>'}</tbody>
  </table>

  <script>
    const data = ${JSON.stringify(chartData)};
    new Chart(document.getElementById('callsChart'), {
      type: 'bar',
      data: { labels: data.labels, datasets: [{ label: 'Calls', data: data.callsPerMinute, backgroundColor: '#4c8bf5' }] },
      options: { scales: { x: { ticks: { maxRotation: 0, autoSkip: true } } }, plugins: { legend: { display: false } } },
    });
    new Chart(document.getElementById('durationChart'), {
      type: 'line',
      data: { labels: data.labels, datasets: [{ label: 'Avg ms', data: data.avgMsPerMinute, borderColor: '#f5a623', tension: 0.2 }] },
      options: { scales: { x: { ticks: { maxRotation: 0, autoSkip: true } } }, plugins: { legend: { display: false } } },
    });
  </script>
  `}
</body>
</html>`;
}

function main(): void {
  const { since, out } = parseArgs();
  const sinceIso = since ? parseSinceArg(since) : null;

  const rows = new CallMetricsRepository().findSince(sinceIso);
  const html = renderHtml(rows);

  const outDir = path.resolve(__dirname, '..', '..', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.isAbsolute(out) ? out : path.join(outDir, out);
  fs.writeFileSync(outPath, html);

  console.log(`Wrote ${rows.length} call(s) to ${outPath}`);
}

main();
