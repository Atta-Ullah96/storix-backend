import rateLimit from "express-rate-limit";

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: {
    success: false,
    message: "Too many requests, please try again later",
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: {
    success: false,
    message: "Too many login attempts, please try again later",
  },
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 50,
  message: {
    success: false,
    message: "Too many upload requests, please try again later",
  },
});