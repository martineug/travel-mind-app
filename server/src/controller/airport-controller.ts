import { Router, Request, Response } from 'express';
import { requireUser } from './session';
import { suggestAirports } from '../service/flight/flight-service';
import { createLogger } from '../logger';


const router = Router();
const logger = createLogger('airport-controller');

// GET /api/airports/suggest?query=... — airport autocomplete for the flight wizard's pickers, decoupled from the chat/agent system.
router.get('/airports/suggest', async (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return;

  const query = (req.query.query as string | undefined)?.trim();
  logger.traceCall('GET /airports/suggest', { query }, { userId: user.userId });

  if (!query || query.length < 2) {
    return res.json({ suggestions: [] });
  }

  const suggestions = await suggestAirports(query);
  logger.traceRet('GET /airports/suggest', { query, count: suggestions.length });
  return res.json({ suggestions });
});

export default router;
