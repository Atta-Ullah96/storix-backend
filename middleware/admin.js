import { AppError } from './error.js';

export const checkBlockedUser = (req, _res, next) => {
  if (req.user?.status === 'blocked') {
    return next(new AppError('Your account has been blocked', 403));
  }

  return next();
};

export const requireAdmin = (req, _res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }

  if (req.user.role !== 'admin') {
    return next(new AppError('Admin access required', 403));
  }

  return next();
};
