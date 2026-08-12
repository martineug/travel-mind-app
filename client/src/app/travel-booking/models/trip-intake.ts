import { AgentType } from './agent-type';
import { WizardQuestion } from './wizard-question';

export interface TripIntakeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TripIntakeSummary {
  destination: string;
  travellerCount: number;
  verticals: AgentType[];
  /** Present only when its vertical is in `verticals` */
  flightsDescription?: string;
  staysDescription?: string;
  carsDescription?: string;
}

/** Each of the wizard's three phases gets its own narrow response shape,
 * the server decides the next phase, not the model. */
export interface TripIntakeBasicsResponse {
  message: string;
  destination: string | null;
  travellerCount: number | null;
  questions?: WizardQuestion[];   // present once destination + travellerCount are both known
}

export interface TripIntakeQuestionsResponse {
  message: string;
  questions: WizardQuestion[];
}

export interface TripIntakeSummaryResponse {
  message: string;
  summary: TripIntakeSummary;
}
