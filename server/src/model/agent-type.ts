export type AgentType = 'flights' | 'stays' | 'cars';

export const AGENT_TYPES: readonly AgentType[] = ['flights', 'stays', 'cars'];

export function isAgentType(value: unknown): value is AgentType {
  return typeof value === 'string' && (AGENT_TYPES as readonly string[]).includes(value);
}
