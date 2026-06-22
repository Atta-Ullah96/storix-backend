import Auth from '../models/auth.js';
import Payment from '../models/payment.js';
import Subscription from '../models/subscription.js';
import { getStripe } from '../config/stripe.js';
import { AppError } from '../middleware/error.js';
import {
  getPlanByPriceId,
  getPlanPriceId,
  getStorageLimitByPlan,
} from '../utils/plans.js';

const SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
]);

const getId = (value) => {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
};

const toDate = (timestamp) => (timestamp ? new Date(timestamp * 1000) : null);

const getSubscriptionPeriod = (subscription) => {
  const item = subscription.items?.data?.[0];

  return {
    currentPeriodStart: toDate(item?.current_period_start),
    currentPeriodEnd: toDate(item?.current_period_end),
  };
};

const getSubscriptionPrice = (subscription) =>
  subscription.items?.data?.[0]?.price || null;

const normalizeSubscriptionStatus = (status) =>
  SUBSCRIPTION_STATUSES.has(status) ? status : 'incomplete';

const getInvoiceSubscriptionId = (invoice) => {
  const parentSubscription = invoice.parent?.subscription_details?.subscription;
  return getId(parentSubscription) || getId(invoice.subscription);
};

const getInvoicePaymentIntentId = (invoice) => {
  const invoicePayment = invoice.payments?.data?.find(
    (payment) => payment.payment?.payment_intent
  );

  return (
    getId(invoicePayment?.payment?.payment_intent) ||
    getId(invoice.payment_intent)
  );
};

export const createOrGetStripeCustomer = async (user) => {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const customer = await getStripe().customers.create({
    email: user.email,
    name: user.name,
    metadata: {
      userId: user._id.toString(),
    },
  });

  user.stripeCustomerId = customer.id;
  await user.save();

  return customer.id;
};

export const createCheckoutSession = async ({ user, planKey }) => {
  if (
    user.stripeSubscriptionId &&
    ['active', 'trialing', 'past_due'].includes(user.subscriptionStatus)
  ) {
    throw new AppError(
      'You already have a subscription. Use the billing portal to manage it.',
      409
    );
  }

  const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL;

  if (!clientUrl) {
    throw new AppError('CLIENT_URL is not configured', 500);
  }

  const customerId = await createOrGetStripeCustomer(user);
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: user._id.toString(),
    line_items: [
      {
        price: getPlanPriceId(planKey),
        quantity: 1,
      },
    ],
    metadata: {
      userId: user._id.toString(),
      planKey,
    },
    subscription_data: {
      metadata: {
        userId: user._id.toString(),
        planKey,
      },
    },
    success_url: `${clientUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientUrl}/pricing`,
  });

  return session;
};

export const createPortalSession = async (user) => {
  if (!user.stripeCustomerId) {
    throw new AppError('No Stripe customer exists for this account', 400);
  }

  const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL;

  if (!clientUrl) {
    throw new AppError('CLIENT_URL is not configured', 500);
  }

  return getStripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${clientUrl}/dashboard/billing`,
  });
};

export const setSubscriptionCancellation = async ({
  subscriptionId,
  cancelAtPeriodEnd,
}) =>
  getStripe().subscriptions.update(subscriptionId, {
    cancel_at_period_end: cancelAtPeriodEnd,
  });

export const syncStripeSubscription = async (stripeSubscription) => {
  const customerId = getId(stripeSubscription.customer);
  const price = getSubscriptionPrice(stripeSubscription);
  const planKey = getPlanByPriceId(price?.id);

  if (!planKey || planKey === 'free') {
    throw new AppError('Stripe subscription contains an unknown price', 400);
  }

  const userId = stripeSubscription.metadata?.userId;
  const user =
    (userId ? await Auth.findById(userId) : null) ||
    (await Auth.findOne({ stripeCustomerId: customerId }));

  if (!user) {
    throw new AppError('Subscription user not found', 404);
  }

  const status = normalizeSubscriptionStatus(stripeSubscription.status);
  const { currentPeriodStart, currentPeriodEnd } =
    getSubscriptionPeriod(stripeSubscription);
  const latestInvoiceId = getId(stripeSubscription.latest_invoice);

  await Auth.updateOne(
    { _id: user._id },
    {
      $set: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: stripeSubscription.id,
        subscriptionPlan: planKey,
        subscriptionStatus: status,
        currentPeriodEnd,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        storageLimit: getStorageLimitByPlan(planKey),
      },
    }
  );

  return Subscription.findOneAndUpdate(
    { stripeSubscriptionId: stripeSubscription.id },
    {
      $set: {
        user: user._id,
        stripeCustomerId: customerId,
        stripePriceId: price.id,
        planKey,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        amount: price.unit_amount || 0,
        currency: price.currency || 'usd',
        interval: price.recurring?.interval || 'month',
        latestInvoiceId,
      },
    },
    { new: true, upsert: true, runValidators: true }
  );
};

export const downgradeDeletedSubscription = async (stripeSubscription) => {
  const customerId = getId(stripeSubscription.customer);
  const user = await Auth.findOne({
    $or: [
      { stripeCustomerId: customerId },
      { stripeSubscriptionId: stripeSubscription.id },
    ],
  });

  if (!user) {
    throw new AppError('Subscription user not found', 404);
  }

  await Auth.updateOne(
    { _id: user._id },
    {
      $set: {
        subscriptionPlan: 'free',
        subscriptionStatus: 'canceled',
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        storageLimit: getStorageLimitByPlan('free'),
      },
    }
  );

  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: stripeSubscription.id },
    {
      $set: {
        status: 'canceled',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date(),
      },
    }
  );
};

export const saveInvoicePayment = async (invoice, status) => {
  const customerId = getId(invoice.customer);
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  const user = await Auth.findOne({ stripeCustomerId: customerId });

  if (!user) {
    throw new AppError('Invoice user not found', 404);
  }

  const paymentIntentId = getInvoicePaymentIntentId(invoice);
  const paidAt = invoice.status_transitions?.paid_at
    ? toDate(invoice.status_transitions.paid_at)
    : null;

  const payment = await Payment.findOneAndUpdate(
    { stripeInvoiceId: invoice.id },
    {
      $set: {
        user: user._id,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePaymentIntentId: paymentIntentId,
        planKey: user.subscriptionPlan || 'free',
        amountPaid: invoice.amount_paid || 0,
        amountDue: invoice.amount_due || 0,
        currency: invoice.currency || 'usd',
        status,
        hostedInvoiceUrl: invoice.hosted_invoice_url || null,
        invoicePdf: invoice.invoice_pdf || null,
        paidAt,
      },
    },
    { new: true, upsert: true, runValidators: true }
  );

  if (subscriptionId && paymentIntentId) {
    await Subscription.updateOne(
      { stripeSubscriptionId: subscriptionId },
      {
        $set: {
          latestInvoiceId: invoice.id,
          latestPaymentIntentId: paymentIntentId,
        },
      }
    );
  }

  if (status === 'failed') {
    await Auth.updateOne(
      { _id: user._id },
      { $set: { subscriptionStatus: 'past_due' } }
    );
    await Subscription.updateOne(
      { stripeSubscriptionId: subscriptionId },
      { $set: { status: 'past_due', latestInvoiceId: invoice.id } }
    );
  }

  return payment;
};

export const handleCheckoutCompleted = async (session) => {
  const userId = session.metadata?.userId || session.client_reference_id;

  if (!userId) {
    throw new AppError('Checkout session is missing user metadata', 400);
  }

  await Auth.updateOne(
    { _id: userId },
    {
      $set: {
        stripeCustomerId: getId(session.customer),
        stripeSubscriptionId: getId(session.subscription),
      },
    }
  );

  const subscriptionId = getId(session.subscription);

  if (subscriptionId) {
    const subscription =
      await getStripe().subscriptions.retrieve(subscriptionId);
    await syncStripeSubscription(subscription);
  }
};

export const constructWebhookEvent = ({ rawBody, signature }) => {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError('STRIPE_WEBHOOK_SECRET is not configured', 500);
  }

  if (!signature) {
    throw new AppError('Stripe signature is missing', 400);
  }

  return getStripe().webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
};
