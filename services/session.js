import { redisClient } from '../config/redis.js';

const SESSION_PREFIX = "storix:session:";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export const createOrReuseSession = async (userId) => {
   const sessionId = crypto.randomUUID();

  const sessionKey = `${SESSION_PREFIX}${sessionId}`;




  let session = await redisClient.json.get(sessionKey)

  if (!session) {
    session = await redisClient.json.set(sessionKey , "$" ,{user: userId});
    await redisClient.expire(sessionKey, SESSION_TTL_SECONDS);
  }



  return session;
};


export const getSession = async (sessionId) => {
  if (!sessionId) {
    return null;
  }

  const sessionKey = `${SESSION_PREFIX}${sessionId}`;

  const session = await redisClient.json.get(sessionKey);

  return session || null;
};

export const deleteSessionById = async (sessionId) => {
  if (!sessionId) {
    return null;
  }

  const sessionKey = `${SESSION_PREFIX}${sessionId}`;

  return redisClient.del(sessionKey);
};
