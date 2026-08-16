import { AgentType } from './agent-type';
import { Flight } from './flight';
import { Stay } from './stay';
import { Car } from './car';
import { Traveller } from './traveller';

export interface AgentResponse {
  action: 'chat' | 'search' | 'payment';
  message: string;
  flights?: Flight[];
  stays?: Stay[];
  cars?: Car[];
  /** Present when a file-producing tool ran (e.g. generate_itinerary_pdf), any action type. */
  file?: { name: string; url: string };
  /** Present when list_files ran — every file in the user's workspace, with a download link each. */
  files?: { name: string; url: string }[];
  /** Present when action === 'payment'. */
  client_token?:      string;
  payment_intent_id?: string;
  offer_id?:          string;
  total?:             string;
  currency?:          string;
  passengers?:        Traveller[];
}

export interface ChatbotMessageResponse {
  response: string;
}

export interface ChatPreview {
  id: string;
  preview: string;
  agentType: AgentType;
}

export interface ChatMessage {
  role: string;
  content: string;
  createdAt: string;
}

export interface ChatbotStateResponse {
  currentChatId: string;
  currentTripId: string;
  currentAgentType: AgentType;
  messages: ChatMessage[];
  chats: ChatPreview[];
}

export interface SwitchChatResponse {
  currentChatId: string;
  currentAgentType: AgentType;
  messages: ChatMessage[];
}

export interface NewChatResponse {
  currentChatId: string;
  currentAgentType: AgentType;
  /** Present only when the request included a 'description'*/
  kickoffMessage?: string;
}

export interface VerticalSearchJob {
  agentType: AgentType;
  chatId: string;
  kickoffMessage: string;
}

export interface DeleteChatResponse {
  currentChatId: string;
  currentAgentType: AgentType;
}
