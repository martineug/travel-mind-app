import { Router, Request, Response } from 'express';
import { requireUser } from './session';
import { Message } from 'ollama';
import { runTripIntakeBasics, buildVerticalQuestionsResponse, buildTripIntakeSummary } from '../service/trip/trip-intake-service';
import { AgentType, isAgentType } from '../model/agent-type';
import { WizardAnswer } from '../model/wizard-question';
import { createLogger } from '../logger';

const router = Router();
const logger = createLogger('trip-intake-controller');

function parseVerticals(raw: unknown): AgentType[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every(isAgentType)) return null;
  return raw as AgentType[];
}

// POST /api/trip-intake/message — phase 1: free-text extraction of destination + traveller
// count, the only LLM-driven part. Once both are non-null, carries the static step-3 batch.
router.post('/trip-intake/message', async (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const { history, message } = req.body as { history?: Message[]; message?: string };
  logger.traceCall('POST /trip-intake/message', { historyLength: history?.length ?? 0 }, { userId: user.userId, message });

  if (!message?.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const result = await runTripIntakeBasics(history ?? [], message);
    res.json(result);
    logger.traceRet('POST /trip-intake/message', { destination: result.destination, travellerCount: result.travellerCount });
  } catch (err) {
    logger.error({ err }, 'POST /trip-intake/message failed');
    res.status(502).json({ error: `Trip intake failed: ${err}` });
  }
});

// POST /api/trip-intake/vertical-questions — phase 2: the step-4 batch, built deterministically (no LLM) from steps 1-3's facts.
router.post('/trip-intake/vertical-questions', (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const { destination, travellerCount, departureDate, returnDate, verticals } = req.body as {
    destination?: string; travellerCount?: number; departureDate?: string; returnDate?: string; verticals?: unknown;
  };
  const parsedVerticals = parseVerticals(verticals);
  logger.traceCall('POST /trip-intake/vertical-questions', { destination, travellerCount, departureDate, returnDate, verticals: parsedVerticals }, { userId: user.userId });

  if (!destination?.trim() || !travellerCount || !departureDate?.trim() || !returnDate?.trim() || !parsedVerticals) {
    return res.status(400).json({ error: 'destination, travellerCount, departureDate, returnDate, and a non-empty verticals array are required' });
  }

  const result = buildVerticalQuestionsResponse(parsedVerticals, destination, travellerCount, departureDate, returnDate);
  res.json(result);
  logger.traceRet('POST /trip-intake/vertical-questions', { questionCount: result.questions.length });
});

// POST /api/trip-intake/summary — phase 3: structural fields computed in code; the LLM is
// invoked once, narrowly, to phrase each vertical's facts into a recap (see buildTripIntakeSummary's fallback).
router.post('/trip-intake/summary', async (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const { destination, travellerCount, verticals, answers } = req.body as {
    destination?: string; travellerCount?: number; verticals?: unknown; answers?: Record<string, WizardAnswer>;
  };
  const parsedVerticals = parseVerticals(verticals);
  logger.traceCall('POST /trip-intake/summary', { destination, travellerCount, verticals: parsedVerticals }, { userId: user.userId, answers });

  if (!destination?.trim() || !travellerCount || !parsedVerticals || !answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'destination, travellerCount, a non-empty verticals array, and answers are required' });
  }

  try {
    const result = await buildTripIntakeSummary(destination, travellerCount, parsedVerticals, answers);
    res.json(result);
    logger.traceRet('POST /trip-intake/summary', { verticals: result.summary.verticals });
  } catch (err) {
    logger.error({ err }, 'POST /trip-intake/summary failed');
    res.status(502).json({ error: `Trip intake summary failed: ${err}` });
  }
});

export default router;
