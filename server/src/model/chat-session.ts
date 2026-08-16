import { ChatMessage } from './chat-message';
import { AgentType } from './agent-type';
import { WizardAnswer } from './wizard-question';

export interface ChatSession {
  id: string;
  tripId: string;
  agentType: AgentType;
  /** Structured search-form answers the wizard seeded this chat with at creation — null for chats created without them. */
  lastSearchAnswers: Record<string, WizardAnswer> | null;
  messages: ChatMessage[];
}
