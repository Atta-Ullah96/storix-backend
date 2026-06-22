import Auth from '../models/auth.js';
import { deleteSessionById, getSession } from '../services/session.js';
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
    'name email avatar provider role status storageUsed storageLimit lastActiveAt subscriptionPlan subscriptionStatus stripeCustomerId stripeSubscriptionId currentPeriodEnd cancelAtPeriodEnd'
  );

  if (!user) {
    await deleteSessionById(sessionId);
    clearSessionCookie(res);
    throw new AppError('Session user not found', 401);
  }

  if (user.status === 'blocked') {
    await deleteSessionById(sessionId);
    clearSessionCookie(res);
    throw new AppError('Your account has been blocked', 403);
  }

  const now = new Date();
  user.lastActiveAt = now;
  await Auth.updateOne({ _id: user._id }, { $set: { lastActiveAt: now } });

  req.session = {
    id: sessionId,
    ...session,
  };
  req.user = user;

  next();
});
