import { AgentType } from '../models/agent-type';

export interface ChatPanelConfig {
  title: string;
  subheading: string;
  greeting: string;
  suggestions: string[];
  messagePrompt: string;
}

export const CHAT_PANEL_CONFIG: Record<AgentType, ChatPanelConfig> = {
  flights: {
    title: 'Flight booking agent',
    subheading: 'Flight concierge · 300+ airlines',
    greeting:
      "Hello! I'm your travel booking concierge, connected to 300+ airlines via Duffel. Tell me where you'd like to fly and when - I'll find the best options for you.",
    suggestions: [
      'Dublin to New York, May',
      'Cheapest flights to Tokyo',
      'Business class to Dubai',
      'Weekend trip to Barcelona',
    ],
    messagePrompt: 'Where would you like to fly?',
  },

  stays: {
    title: 'Stay booking agent',
    subheading: 'Stay concierge · live search · booking coming soon',
    greeting:
      "Hello! I'm your stay-booking concierge, connected to Duffel's live stay search. Tell me where you'd like to stay and your dates - I'll find some options. Booking isn't wired up yet, but I can help you compare what's available.",
    suggestions: [
      'Stays near the Eiffel Tower',
      'Family-friendly resort in Lisbon',
      'Boutique stay in Tokyo for a week',
      'Budget stays in Barcelona',
    ],
    messagePrompt: 'Where would you like to stay?',
  },

  cars: {
    title: 'Car booking agent',
    subheading: 'Car rental concierge · live search & booking',
    greeting:
      "Hello! I'm your car-rental concierge, connected to Duffel's live car search. Tell me your pickup location, dates, and vehicle preferences and I'll find some options for you.",
    suggestions: [
      'SUV rental in Dublin for a week',
      'Cheapest car in Rome this weekend',
      'Automatic rental at JFK airport',
      'One-way rental Dublin to Cork',
    ],
    messagePrompt: 'Where would you like to pick up your car?',
  },
};
