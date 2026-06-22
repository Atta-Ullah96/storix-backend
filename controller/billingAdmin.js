import Auth from '../models/auth.js';
import Payment from '../models/payment.js';
import Subscription from '../models/subscription.js';
import { AppError, asyncHandler } from '../middleware/error.js';
import { escapeRegex, getPagination } from '../services/admin.js';
import { isValidMongoId } from '../utils/isValidMongodbId.js';

const SUBSCRIPTION_SORT_FIELDS = new Set([
  'createdAt',
  'currentPeriodEnd',
  'amount',
]);
const PAYMENT_SORT_FIELDS = new Set(['createdAt', 'paidAt', 'amountPaid']);

const getSort = (field, order, allowedFields) => ({
  [allowedFields.has(field) ? field : 'createdAt']: order === 'asc' ? 1 : -1,
});

const addUserSearch = async (filter, search) => {
  if (!search) return;

  const expression = new RegExp(escapeRegex(search), 'i');
  const users = await Auth.find({
    $or: [{ name: expression }, { email: expression }],
  }).distinct('_id');

  filter.user = { $in: users };
};

export const getSubscriptions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (req.query.plan) filter.planKey = req.query.plan;
  if (req.query.status) filter.status = req.query.status;
  await addUserSearch(filter, req.query.search);

  const [subscriptions, total] = await Promise.all([
    Subscription.find(filter)
      .populate('user', 'name email avatar storageUsed storageLimit')
      .sort(
        getSort(
          req.query.sortBy || req.query.sort,
          req.query.order,
          SUBSCRIPTION_SORT_FIELDS
        )
      )
      .skip(skip)
      .limit(limit),
    Subscription.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Subscriptions retrieved successfully',
    data: {
      subscriptions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

export const getSubscriptionDetails = asyncHandler(async (req, res) => {
  if (!isValidMongoId(req.params.id)) {
    throw new AppError('Invalid subscription id', 400);
  }

  const subscription = await Subscription.findById(req.params.id).populate(
    'user',
    'name email avatar storageUsed storageLimit subscriptionPlan subscriptionStatus'
  );

  if (!subscription) throw new AppError('Subscription not found', 404);

  const payments = await Payment.find({
    stripeSubscriptionId: subscription.stripeSubscriptionId,
  }).sort({ createdAt: -1 });

  res.json({
    success: true,
    data: {
      subscription,
      payments,
      storage: {
        used: subscription.user.storageUsed,
        limit: subscription.user.storageLimit,
        remaining: Math.max(
          subscription.user.storageLimit - subscription.user.storageUsed,
          0
        ),
      },
    },
  });
});

export const getPayments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.plan) filter.planKey = req.query.plan;
  await addUserSearch(filter, req.query.search);

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('user', 'name email')
      .sort(
        getSort(
          req.query.sortBy || req.query.sort,
          req.query.order,
          PAYMENT_SORT_FIELDS
        )
      )
      .skip(skip)
      .limit(limit),
    Payment.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: 'Payments retrieved successfully',
    data: {
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

export const getSubscriptionStats = asyncHandler(async (_req, res) => {
  const [
    freeUsers,
    proUsers,
    businessUsers,
    statusCounts,
    revenue,
    recurring,
    recentPayments,
    recentCanceledSubscriptions,
  ] = await Promise.all([
    Auth.countDocuments({
      $or: [
        { subscriptionPlan: 'free' },
        { subscriptionPlan: { $exists: false } },
      ],
    }),
    Auth.countDocuments({ subscriptionPlan: 'pro' }),
    Auth.countDocuments({ subscriptionPlan: 'business' }),
    Subscription.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amountPaid' } } },
    ]),
    Subscription.aggregate([
      { $match: { status: { $in: ['active', 'trialing'] } } },
      {
        $group: {
          _id: null,
          mrr: {
            $sum: {
              $cond: [
                { $eq: ['$interval', 'year'] },
                { $divide: ['$amount', 12] },
                '$amount',
              ],
            },
          },
          subscribers: { $sum: 1 },
        },
      },
    ]),
    Payment.find({ status: 'paid' })
      .populate('user', 'name email avatar')
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(10),
    Subscription.find({ status: 'canceled' })
      .populate('user', 'name email avatar')
      .sort({ updatedAt: -1 })
      .limit(10),
  ]);

  const statuses = Object.fromEntries(
    statusCounts.map(({ _id, count }) => [_id, count])
  );

  res.json({
    success: true,
    data: {
      totalSubscribers: proUsers + businessUsers,
      freeUsers,
      proSubscribers: proUsers,
      businessSubscribers: businessUsers,
      activeSubscriptions: (statuses.active || 0) + (statuses.trialing || 0),
      canceledSubscriptions: statuses.canceled || 0,
      pastDueSubscriptions: statuses.past_due || 0,
      statuses,
      monthlyRecurringRevenue: recurring[0]?.mrr || 0,
      totalRevenue: revenue[0]?.total || 0,
      currency: 'usd',
      amountsAreInCents: true,
      recentPayments,
      recentCanceledSubscriptions,
    },
  });
});
