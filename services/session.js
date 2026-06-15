import { randomUUID } from 'crypto';
import { redisClient } from '../config/redis.js';

const SESSION_PREFIX = 'storix:session:';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const getSessionKey = (sessionId) => `${SESSION_PREFIX}${sessionId}`;

export const createOrReuseSession = async (userId) => {
  const sessionId = randomUUID();
  const session = { userId: userId.toString() };

  await redisClient.json.set(getSessionKey(sessionId), '$', session);
  await redisClient.expire(getSessionKey(sessionId), SESSION_TTL_SECONDS);

  return { session, sessionId };
};

export const getSession = async (sessionId) => {
  if (!sessionId) {
    return null;
  }

  return redisClient.json.get(getSessionKey(sessionId));
};

export const deleteSessionById = async (sessionId) => {
  if (!sessionId) {
    return null;
  }

  return redisClient.del(getSessionKey(sessionId));
};
