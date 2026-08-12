import { Router, Request, Response } from 'express';
import { COOKIE_NAME } from './session';
import { signUp, signIn, getUserFromToken, AuthError } from '../service/auth/auth-service';
import { evictChatBot } from './chat-controller';
import { createLogger } from '../logger';

const router = Router();
const logger = createLogger('auth-controller');

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: COOKIE_MAX_AGE,
};

// POST /api/auth/sign-up
router.post('/auth/sign-up', async (req: Request, res: Response) => {
  const { email, password, firstName, lastName, phoneNumber, bornOn, gender, title } = req.body;
  logger.traceCall('POST /auth/sign-up', { email }, { firstName, lastName });

  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ error: 'email, password, firstName, and lastName are required' });
  }
  if (!phoneNumber || !bornOn || !gender || !title) {
    return res.status(400).json({ error: 'phoneNumber, bornOn, gender, and title are required' });
  }

  try {
    const { user, token } = await signUp(email, password, firstName, lastName, { phoneNumber, bornOn, gender, title });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    logger.traceRet('POST /auth/sign-up', { userId: user.userId });
    return res.status(201).json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }
});

// POST /api/auth/sign-in
router.post('/auth/sign-in', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  logger.traceCall('POST /auth/sign-in', { email }, {});

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const { user, token } = await signIn(email, password);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    logger.traceRet('POST /auth/sign-in', { userId: user.userId });
    return res.json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }
});

// POST /api/auth/sign-out
router.post('/auth/sign-out', (req: Request, res: Response) => {
  logger.traceCall('POST /auth/sign-out', {}, {});

  const token = req.cookies?.[COOKIE_NAME];
  const user = token ? getUserFromToken(token) : null;
  if (user) {
    evictChatBot(user.userId);
  }

  res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
  return res.status(204).send();
});

// GET /api/auth/me
router.get('/auth/me', (req: Request, res: Response) => {
  logger.traceCall('GET /auth/me', {}, {});

  const token = req.cookies?.[COOKIE_NAME];
  const user = token ? getUserFromToken(token) : null;

  if (!user) {
    return res.status(401).json({ error: 'Not signed in' });
  }

  logger.traceRet('GET /auth/me', { userId: user.userId });
  return res.json({ user });
});

export default router;
