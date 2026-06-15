import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: {
    success: false,
    message: 'Too many requests, please try again later',
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,

  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase()?.trim() || 'unknown';
    const ip = ipKeyGenerator(req.ip);
    return `${ip}-${email}`;
  },

  message: {
    success: false,
    message: 'Too many login attempts, please try again later',
  },
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 50,

  keyGenerator: (req) => {
    const ip = ipKeyGenerator(req.ip);
    return req.user?._id?.toString() || ip;
  },
  message: {
    success: false,
    message: 'Too many upload requests, please try again later',
  },
});
