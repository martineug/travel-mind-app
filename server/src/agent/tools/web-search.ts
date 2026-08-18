import { Tool } from '../tool';

const DEFAULT_MAX_RESULTS = 3;

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, '')).trim();
}

// DuckDuckGo's HTML results wrap the real URL behind /l/?uddg=<encoded>
function resolveResultUrl(href: string): string {
  try {
    const url = new URL(decodeHtmlEntities(href), 'https://duckduckgo.com');
    const uddg = url.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : url.toString();
  } catch {
    return href;
  }
}

// Each result — organic or sponsored — sits in its own
// `result results_links results_links_deep <kind>` block; sponsored ones carry a
// `result--ad` class and their href is a duckduckgo.com/y.js tracking redirect rather than
// a real article URL, so they're skipped entirely instead of being surfaced as regular hits.
const RESULT_BLOCK_REGEX = /<div class="result results_links results_links_deep ([^"]*)">([\s\S]*?)(?=<div class="result results_links results_links_deep |$)/g;
const RESULT_LINK_REGEX =
  /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/;

function parseResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  let blockMatch: RegExpExecArray | null;
  while (results.length < maxResults && (blockMatch = RESULT_BLOCK_REGEX.exec(html)) !== null) {
    const [, classes = '', block = ''] = blockMatch;
    if (classes.includes('result--ad')) continue;

    const linkMatch = RESULT_LINK_REGEX.exec(block);
    if (!linkMatch) continue;
    const [, href = '', title = '', snippet = ''] = linkMatch;
    results.push({ url: resolveResultUrl(href), title: stripTags(title), snippet: stripTags(snippet) });
  }
  return results;
}

// Returns raw JSON (not prose) — chatbot-service.ts's attachSourcesFromTrace() parses this
// to attach real, clickable source links, same reasoning as list_files' file links: the model
// can't be trusted to transcribe a URL into "message" without mangling or inventing one.
async function webSearch(query: string, maxResults: number = DEFAULT_MAX_RESULTS): Promise<string> {
  const response = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (compatible; AgentLab/1.0)',
    },
    body: new URLSearchParams({ q: query }),
  });
  if (!response.ok) {
    return `Error searching for: ${query} (HTTP ${response.status})`;
  }

  const results = parseResults(await response.text(), maxResults);
  return JSON.stringify(results);
}

export const webSearchTool = new Tool(
  'web_search',
  'Search the web using DuckDuckGo. Returns a JSON array of results, each with "title", "snippet", and "url".',
  {
    query: { type: 'string', description: 'The search query.' },
  },
  (args: Record<string, any>) => webSearch(args['query'] as string),
);
