import { Message } from 'ollama';
import { NativeToolAgent } from '../../agent/agent';
import { ToolRegistry } from '../../agent/registry';
import {
  TRIP_INTAKE_BASICS_PROMPT,
  TRIP_INTAKE_DESCRIPTION_PROMPT,
  buildTodayContext,
  buildTripDatesIntroMessage,
  buildVerticalQuestionsIntroMessage,
} from '../../agent/prompts';
import { parseAgentJson } from '../../agent/parse-agent-json';
import { getTripDatesQuestions, buildTripIntakeVerticalQuestions, isVerticalIncluded } from '../../agent/vertical-questions';
import { WizardQuestion, WizardAnswer } from '../../model/wizard-question';
import { AgentType, AGENT_TYPES } from '../../model/agent-type';
import { createLogger } from '../../logger';
import config from '../../config';

const logger = createLogger('trip-intake-service');

export interface TripIntakeSummary {
  destination: string;
  travellerCount: number;
  verticals: AgentType[];
  flightsDescription?: string;
  staysDescription?: string;
  carsDescription?: string;
}

export interface TripIntakeBasicsResult {
  message: string;
  destination: string | null;
  travellerCount: number | null;
  questions?: WizardQuestion[];
}

export interface TripIntakeQuestionsResult {
  message: string;
  questions: WizardQuestion[];
}

interface BasicsReply {
  message?: string;
  destination?: string | null;
  travellerCount?: number | null;
}

function buildIntakeAgent(systemPrompt: string, label: string, history: Message[] = [], enableThinking: boolean = config.ollama.enableThinking): NativeToolAgent {
  const agent = new NativeToolAgent({
    model: config.ollama.model,
    registry: new ToolRegistry(),
    systemPrompt,
    numCtx: config.ollama.numCtx,
    maxIterations: config.ollama.maxIterations,
    enableThinking,
    verbose: config.ollama.verbose,
    context: { label },
  });
  agent.setMessageHistory(history);
  agent.refreshSystemMessage(buildTodayContext());
  return agent;
}

/** Phase 1 ("Basics"): the only wizard phase still driven by free-text LLM conversation,
 *  narrowly extracting destination/traveller count, never deciding UI. Stateless. Once both
 *  fields are non-null, the server attaches the static step-3 batch itself — never an LLM action string. */
export async function runTripIntakeBasics(history: Message[], message: string): Promise<TripIntakeBasicsResult> {
  logger.debugInfoCall('runTripIntakeBasics', { historyLength: history.length }, { message });

  const agent = buildIntakeAgent(TRIP_INTAKE_BASICS_PROMPT, 'trip_intake_basics', history);
  const [answer] = await agent.run(message);

  const parsed = parseAgentJson<BasicsReply>(answer);
  const destination = parsed?.destination ?? null;
  const travellerCount = parsed?.travellerCount ?? null;
  // A parse failure here just re-shows raw text and asks again
  const result: TripIntakeBasicsResult = { message: parsed?.message || answer, destination, travellerCount };

  if (destination && travellerCount) {
    result.message = buildTripDatesIntroMessage(destination);
    result.questions = getTripDatesQuestions();
  }

  logger.debugInfoRet('runTripIntakeBasics', { destination, travellerCount, hasQuestions: !!result.questions });
  return result;
}

/** Phase 2: once step 3 is submitted, every value step 4 needs is already known
 *  structurally — no LLM call, just the deterministic template in vertical-questions.ts. */
export function buildVerticalQuestionsResponse(
  verticals: AgentType[],
  destination: string,
  travellerCount: number,
  departureDate: string,
  returnDate: string,
): TripIntakeQuestionsResult {
  logger.debugInfoCall('buildVerticalQuestionsResponse', { verticals, destination, travellerCount, departureDate, returnDate }, {});
  const questions = buildTripIntakeVerticalQuestions(verticals, destination, travellerCount, departureDate, returnDate);
  logger.debugInfoRet('buildVerticalQuestionsResponse', { questionCount: questions.length });
  return { message: buildVerticalQuestionsIntroMessage(), questions };
}

export function formatAnswerValue(question: WizardQuestion, raw: WizardAnswer): string {
  if ((question.type === 'single-select' || question.type === 'multi-select') && question.options) {
    const values = Array.isArray(raw) ? raw : [raw];
    return values.map(v => question.options!.find(o => o.value === v)?.label ?? String(v)).join(', ');
  }
  if (question.type === 'slider') return `${raw}${question.unit ? ` ${question.unit}` : ''}`;
  return String(raw);
}

/** Labelled facts for one vertical, built from its field list (for labels/options) paired
 *  with the user's submitted answers — computed defaults are irrelevant here (empty date args). */
export function formatVerticalFacts(
  agentType: AgentType,
  destination: string,
  travellerCount: number,
  answers: Record<string, WizardAnswer>,
): Record<string, string> {
  const questions = buildTripIntakeVerticalQuestions([agentType], destination, travellerCount, '', '')
    .filter(q => !q.id.endsWith('_include')); // the include/exclude toggle itself isn't a describable fact

  const facts: Record<string, string> = {};
  for (const q of questions) {
    const raw = answers[q.id];
    if (raw === undefined || raw === '') continue;
    facts[q.label] = formatAnswerValue(q, raw);
  }
  return facts;
}

export function templatedDescription(facts: Record<string, string>): string {
  return Object.entries(facts).map(([label, value]) => `${label}: ${value}`).join('; ');
}

const DESCRIPTION_KEY: Record<AgentType, 'flightsDescription' | 'staysDescription' | 'carsDescription'> = {
  flights: 'flightsDescription',
  stays: 'staysDescription',
  cars: 'carsDescription',
};

interface DescriptionsReply {
  flightsDescription?: string;
  staysDescription?: string;
  carsDescription?: string;
}

/** Phase 3: assembles the final TripIntakeSummary. Structural fields are computed in code;
 *  the LLM is invoked once, narrowly, to phrase each vertical's already-correct facts into
 *  a recap sentence — falling back to a templated one if malformed, never blocking the wizard. */
export async function buildTripIntakeSummary(
  destination: string,
  travellerCount: number,
  verticals: AgentType[],
  answers: Record<string, WizardAnswer>,
): Promise<{ message: string; summary: TripIntakeSummary }> {
  logger.debugInfoCall('buildTripIntakeSummary', { destination, travellerCount, verticals }, {});

  const includedVerticals = AGENT_TYPES.filter(v => verticals.includes(v) && isVerticalIncluded(v, answers));
  const factsByVertical = new Map(includedVerticals.map(v => [v, formatVerticalFacts(v, destination, travellerCount, answers)] as const));

  let llmDescriptions: DescriptionsReply | null = null;
  if (includedVerticals.length > 0) {
    // Thinking off: unlike the old monolithic prompt (where disabling it broke control flow),
    // this call makes no control-flow decision — just phrases known facts, with a templated
    // fallback if malformed. Reasoning only added latency here (~59s vs a few seconds).
    const agent = buildIntakeAgent(TRIP_INTAKE_DESCRIPTION_PROMPT, 'trip_intake_summary', [], false);
    const requestFacts: Record<string, Record<string, string>> = {};
    for (const v of includedVerticals) requestFacts[v] = factsByVertical.get(v)!;
    const [answer] = await agent.run(JSON.stringify({ destination, travellerCount, ...requestFacts }));
    llmDescriptions = parseAgentJson<DescriptionsReply>(answer);
  }

  const summary: TripIntakeSummary = { destination, travellerCount, verticals: includedVerticals };
  for (const v of includedVerticals) {
    const key = DESCRIPTION_KEY[v];
    const fromLlm = llmDescriptions?.[key];
    summary[key] = (typeof fromLlm === 'string' && fromLlm.trim()) ? fromLlm : templatedDescription(factsByVertical.get(v)!);
  }

  logger.debugInfoRet('buildTripIntakeSummary', { verticals: summary.verticals, usedLlmDescriptions: !!llmDescriptions });
  return { message: 'Great, I have everything I need!', summary };
}
