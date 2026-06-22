import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Auth',
      required: true,
      index: true,
    },
    stripeCustomerId: { type: String, required: true, index: true },
    stripeSubscriptionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    stripePriceId: { type: String, default: null },
    planKey: {
      type: String,
      enum: ['free', 'pro', 'business'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      default: 'incomplete',
      index: true,
    },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null, index: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'usd', lowercase: true },
    interval: { type: String, default: 'month' },
    latestInvoiceId: { type: String, default: null },
    latestPaymentIntentId: { type: String, default: null },
  },
  { timestamps: true }
);

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription;
