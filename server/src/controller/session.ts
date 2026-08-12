import { Request, Response } from 'express';
import { getUserFromToken } from '../service/auth/auth-service';

/** Name of the httpOnly cookie the JWT is stored in (set/cleared by auth-controller). */
export const COOKIE_NAME = 'session_token';

/** Resolves the signed-in user, sending a 401 and returning null otherwise — a route guards
 *  itself with `const user = requireUser(req, res); if (!user) return;`. Shared deliberately
 *  since a hand-written guard was once missing invisibly; chat-controller has its own control flow. */
export function requireUser(req: Request, res: Response): { userId: string } | null {
  const token = req.cookies?.[COOKIE_NAME];
  const user = token ? getUserFromToken(token) : null;
  if (!user) res.status(401).json({ error: 'Not signed in' });
  return user;
}
