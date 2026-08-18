import { Tool } from '../tool';

const SUMMARY_MAX_CHARS = 1500;

async function wikipediaLookup(topic: string): Promise<string> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'AgentLab/1.0 (educational)' },
  });

  if (response.status === 404) {
    return `Wikipedia article not found for: ${topic}`;
  }
  if (!response.ok) {
    return `Error looking up Wikipedia article for: ${topic} (HTTP ${response.status})`;
  }

  const data = (await response.json()) as { title?: string; extract?: string };
  return `Wikipedia — ${data.title ?? topic}:\n${(data.extract ?? '').slice(0, SUMMARY_MAX_CHARS)}`;
}

export const wikipediaTool = new Tool(
  'wikipedia',
  'Look up a topic on Wikipedia. Returns the article summary.',
  {
    topic: { type: 'string', description: 'The Wikipedia article title to look up.' },
  },
  (args: Record<string, any>) => wikipediaLookup(args['topic'] as string),
);
