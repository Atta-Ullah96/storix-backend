import mongoose from 'mongoose';
import Session from '../models/session.js';
import { getSessionExpiryDate } from '../utils/session.js';

export const createOrReuseSession = async (userId) => {
  const now = new Date();

  await Session.deleteMany({
    user: userId,
    expiresAt: { $lte: now },
  });

  let session = await Session.findOne({
    user: userId,
    expiresAt: { $gt: now },
  }).sort({ createdAt: -1 });

  if (!session) {
    session = await Session.create({
      user: userId,
      expiresAt: getSessionExpiryDate(),
    });
  }

  await Session.deleteMany({
    user: userId,
    _id: { $ne: session._id },
  });

  return session;
};

export const deleteSessionById = async (sessionId) => {
  if (!sessionId || !mongoose.isValidObjectId(sessionId)) {
    return null;
  }

  return Session.findByIdAndDelete(sessionId);
};
