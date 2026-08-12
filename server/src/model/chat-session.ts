import { ChatMessage } from './chat-message';
import { AgentType } from './agent-type';
import { WizardAnswer } from './wizard-question';

export interface ChatSession {
  id: string;
  tripId: string;
  agentType: AgentType;
  /** Structured answers from this chat's most recent "Edit search" submission — null if never submitted (including a wizard chat's first open). */
  lastSearchAnswers: Record<string, WizardAnswer> | null;
  messages: ChatMessage[];
}
