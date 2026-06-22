import Auth from '../models/auth.js';
import Payment from '../models/payment.js';
import Subscription from '../models/subscription.js';
import {
  constructWebhookEvent,
  createCheckoutSession,
  createPortalSession,
  downgradeDeletedSubscription,
  handleCheckoutCompleted,
  saveInvoicePayment,
  setSubscriptionCancellation,
  syncStripeSubscription,
} from '../services/billing.js';
import { AppError, asyncHandler } from '../middleware/error.js';
import { checkoutSchema } from '../validator/billing.js';

const getBillingUser = async (userId) => {
  const user = await Auth.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  return user;
};

export const checkout = asyncHandler(async (req, res) => {
  const { planKey } = checkoutSchema.parse(req.body);
  const user = await getBillingUser(req.user._id);
  const session = await createCheckoutSession({ user, planKey });
  res.status(201).json({ success: true, data: { url: session.url } });
});

export const portal = asyncHandler(async (req, res) => {
  const user = await getBillingUser(req.user._id);
  const session = await createPortalSession(user);
  res.json({ success: true, data: { url: session.url } });
});

export const getMySubscription = asyncHandler(async (req, res) => {
  const user = await getBillingUser(req.user._id);
  const [subscription, payments] = await Promise.all([
    Subscription.findOne({ user: user._id }).sort({ createdAt: -1 }),
    Payment.find({ user: user._id }).sort({ createdAt: -1 }).limit(20),
  ]);

  res.json({
    success: true,
    data: {
      subscriptionPlan: user.subscriptionPlan,
      subscriptionStatus: user.subscriptionStatus,
      storageUsed: user.storageUsed,
      storageLimit: user.storageLimit,
      currentPeriodEnd: user.currentPeriodEnd,
      cancelAtPeriodEnd: user.cancelAtPeriodEnd,
      stripeSubscriptionId: user.stripeSubscriptionId,
      subscription,
      payments,
    },
  });
});

const updateCancellation = (cancelAtPeriodEnd) =>
  asyncHandler(async (req, res) => {
    const user = await getBillingUser(req.user._id);

    if (!user.stripeSubscriptionId) {
      throw new AppError('No active Stripe subscription was found', 400);
    }

    const subscription = await setSubscriptionCancellation({
      subscriptionId: user.stripeSubscriptionId,
      cancelAtPeriodEnd,
    });
    await syncStripeSubscription(subscription);

    res.json({
      success: true,
      message: cancelAtPeriodEnd
        ? 'Subscription will cancel at the end of the billing period'
        : 'Subscription cancellation has been removed',
    });
  });

export const cancelSubscription = updateCancellation(true);
export const resumeSubscription = updateCancellation(false);

export const stripeWebhook = asyncHandler(async (req, res) => {
  let event;

  try {
    event = constructWebhookEvent({
      rawBody: req.body,
      signature: req.headers['stripe-signature'],
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Stripe webhook verification failed: ${error.message}`,
      400
    );
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await syncStripeSubscription(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await downgradeDeletedSubscription(event.data.object);
      break;
    case 'invoice.payment_succeeded':
      await saveInvoicePayment(event.data.object, 'paid');
      break;
    case 'invoice.payment_failed':
      await saveInvoicePayment(event.data.object, 'failed');
      break;
    default:
      break;
  }

  res.json({ received: true });
});
