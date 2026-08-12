// Client-side mirror of the server's AgentType — duplicated since there's no shared package
// between client/server (see server/src/model/agent-type.ts).
export type AgentType = 'flights' | 'stays' | 'cars';
