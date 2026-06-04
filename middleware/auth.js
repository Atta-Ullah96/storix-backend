import mongoose from 'mongoose';
import Session from '../models/session.js';
import { clearSessionCookie, getSessionIdFromRequest } from '../utils/session.js';
import { AppError, asyncHandler } from './error.js';

export const requireAuth = asyncHandler(async (req, res, next) => {
  const sessionId = getSessionIdFromRequest(req);

  if (!sessionId) {
    throw new AppError('Authentication required', 401);
  }

  if (!mongoose.isValidObjectId(sessionId)) {
    clearSessionCookie(res);
    throw new AppError('Invalid session', 401);
  }

  const session = await Session.findById(sessionId).populate(
    'user',
    'name email avatar provider',
  );

  if (!session) {
    clearSessionCookie(res);
    throw new AppError('Session not found', 401);
  }

  if (session.expiresAt <= new Date()) {
    await Session.findByIdAndDelete(session._id);
    clearSessionCookie(res);
    throw new AppError('Session expired', 401);
  }

  if (!session.user) {
    await Session.findByIdAndDelete(session._id);
    clearSessionCookie(res);
    throw new AppError('Session user not found', 401);
  }

  req.session = session;
  req.user = session.user;

  next();
});
