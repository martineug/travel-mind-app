import { AgentType } from './agent-type';
import { ChatMessage, ChatPreview } from './chat';

export interface UserTrip {
  id: string;
  tripName: string;
  createdAt: string;
  updatedAt: string;
}

export interface SwitchTripResponse {
  currentTripId: string;
  currentChatId: string;
  currentAgentType: AgentType;
  messages: ChatMessage[];
  chats: ChatPreview[];
}
