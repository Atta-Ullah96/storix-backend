import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Auth',
      required: true,
      index: true,
    },
    stripeCustomerId: { type: String, required: true, index: true },
    stripeSubscriptionId: { type: String, default: null, index: true },
    stripeInvoiceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    stripePaymentIntentId: { type: String, default: null },
    planKey: {
      type: String,
      enum: ['free', 'pro', 'business'],
      default: 'free',
      index: true,
    },
    amountPaid: { type: Number, default: 0 },
    amountDue: { type: Number, default: 0 },
    currency: { type: String, default: 'usd', lowercase: true },
    status: { type: String, required: true, index: true },
    hostedInvoiceUrl: { type: String, default: null },
    invoicePdf: { type: String, default: null },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
