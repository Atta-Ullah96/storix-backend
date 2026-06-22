import { AppError } from '../middleware/error.js';

export const PLAN_KEYS = ['free', 'pro', 'business'];

export const STORAGE_LIMITS = {
  free: 8 * 1024 * 1024 * 1024,
  pro: 100 * 1024 * 1024 * 1024,
  business: 1024 * 1024 * 1024 * 1024,
};

export const PLAN_PRICES = {
  free: 0,
  pro: 900,
  business: 2900,
};

export const getStorageLimitByPlan = (planKey) => {
  const storageLimit = STORAGE_LIMITS[planKey];

  if (!storageLimit) {
    throw new AppError('Invalid subscription plan', 400);
  }

  return storageLimit;
};

export const getPlanPriceId = (planKey) => {
  const priceIds = {
    pro: process.env.STRIPE_PRO_PRICE_ID,
    business: process.env.STRIPE_BUSINESS_PRICE_ID,
  };
  const priceId = priceIds[planKey];

  if (!['pro', 'business'].includes(planKey)) {
    throw new AppError('Plan must be pro or business', 400);
  }

  if (!priceId) {
    throw new AppError(`Stripe price is not configured for ${planKey}`, 500);
  }

  return priceId;
};

export const getPlanByPriceId = (priceId) => {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'pro';
  if (priceId === process.env.STRIPE_BUSINESS_PRICE_ID) return 'business';
  return 'free';
};
