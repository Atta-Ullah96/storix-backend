import mongoose from 'mongoose';

const authSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required() {
        return this.provider === 'local';
      },
      select: false,
    },
    provider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    storageUsed: {
      type: Number,
      default: 0,
    },

    storageLimit: {
      type: Number,
      default: 8 * 1024 * 1024 * 1024,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },

    status: {
      type: String,
      enum: ['active', 'blocked'],
      default: 'active',
    },
    lastActiveAt: {
      type: Date,
      default: null,
      index: true,
    },
    subscriptionPlan: {
      type: String,
      enum: ['free', 'pro', 'business'],
      default: 'free',
      index: true,
    },
    subscriptionStatus: {
      type: String,
      enum: [
        'free',
        'active',
        'trialing',
        'past_due',
        'canceled',
        'unpaid',
        'incomplete',
      ],
      default: 'free',
      index: true,
    },
    stripeCustomerId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    stripeSubscriptionId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    currentPeriodEnd: {
      type: Date,
      default: null,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Auth = mongoose.model('Auth', authSchema);

export default Auth;
