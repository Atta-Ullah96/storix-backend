import Auth from '../models/auth.js';
import { getSession } from '../services/session.js';
import {
  clearSessionCookie,
  getSessionIdFromRequest,
} from '../utils/cookiesHandling.js';
import { AppError, asyncHandler } from './error.js';

export const requireAuth = asyncHandler(async (req, res, next) => {
  const sessionId = getSessionIdFromRequest(req);

  if (!sessionId) {
    throw new AppError('Authentication required', 401);
  }

  const session = await getSession(sessionId);

  if (!session?.userId) {
    clearSessionCookie(res);
    throw new AppError('Session not found', 401);
  }

  const user = await Auth.findById(session.userId).select(
    'name email avatar provider storageUsed storageLimit',
  );

  if (!user) {
    clearSessionCookie(res);
    throw new AppError('Session user not found', 401);
  }

  req.session = {
    id: sessionId,
    ...session,
  };
  req.user = user;

  next();
});
