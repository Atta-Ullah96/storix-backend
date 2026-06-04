import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import mongoose from 'mongoose';
import Auth from '../models/auth.js';
import Session from '../models/session.js';
import { AppError, asyncHandler } from '../middleware/error.js';
import {
  clearSessionCookie,
  getSessionExpiryDate,
  getSessionIdFromRequest,
  setSessionCookie,
} from '../utils/session.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const isJwtToken = (token) => token.split('.').length === 3;

const getGooglePayloadFromIdToken = async (idToken) => {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  return ticket.getPayload();
};

const getGooglePayloadFromAuthCode = async (code) => {
  if (!process.env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(
      'GOOGLE_CLIENT_SECRET is required for Google code flow',
      500,
    );
  }

  const codeClient = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'postmessage',
  );

  const { tokens } = await codeClient.getToken(code);

  if (!tokens.id_token) {
    throw new AppError('Google did not return an ID token', 401);
  }

  return getGooglePayloadFromIdToken(tokens.id_token);
};

const getGooglePayload = async (token) => {
  try {
    if (isJwtToken(token)) {
      return await getGooglePayloadFromIdToken(token);
    }

    return await getGooglePayloadFromAuthCode(token);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(error.message || 'Google authentication failed', 401);
  }
};

const createOrReuseSession = async (userId) => {
  const now = new Date();

  await Session.deleteMany({
    user: userId,
    expiresAt: { $lte: now },
  });

  let session = await Session.findOne({
    user: userId,
    expiresAt: { $gt: now },
  }).sort({ createdAt: -1 });

  if (!session) {
    session = await Session.create({
      user: userId,
      expiresAt: getSessionExpiryDate(),
    });
  }

  await Session.deleteMany({
    user: userId,
    _id: { $ne: session._id },
  });

  return session;
};

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new AppError('Name, email, and password are required', 400);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await Auth.findOne({ email: normalizedEmail });

  if (existingUser) {
    throw new AppError('User already exists with this email', 409);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await Auth.create({
    name,
    email: normalizedEmail,
    password: hashedPassword,
    provider: 'local',
  });

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }

  const user = await Auth.findOne({
    email: email.toLowerCase().trim(),
  }).select('+password');

  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  if (user.provider === 'google' && !user.password) {
    throw new AppError('Please continue with Google to log in', 401);
  }

  const isPasswordCorrect = await bcrypt.compare(password, user.password);

  if (!isPasswordCorrect) {
    throw new AppError('Invalid email or password', 401);
  }

  const session = await createOrReuseSession(user._id);
  setSessionCookie(res, session._id);

  res.status(200).json({
    success: true,
    message: 'User logged in successfully',
    sessionId: session._id,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
  });
});

export const continueWithGoogle = asyncHandler(async (req, res) => {
  const googleToken =
    req.body.credential || req.body.idToken || req.body.token || req.body.code;

  if (!googleToken) {
    throw new AppError('Google credential is required', 400);
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new AppError('GOOGLE_CLIENT_ID is not configured', 500);
  }

  const payload = await getGooglePayload(googleToken);

  if (!payload?.sub || !payload.email) {
    throw new AppError('Invalid Google credential payload', 401);
  }

  if (!payload.email_verified) {
    throw new AppError('Google email is not verified', 401);
  }

  const normalizedEmail = payload.email.toLowerCase().trim();

  let user = await Auth.findOne({
    $or: [{ googleId: payload.sub }, { email: normalizedEmail }],
  });

  if (!user) {
    user = await Auth.create({
      name: payload.name || normalizedEmail.split('@')[0],
      email: normalizedEmail,
      provider: 'google',
      googleId: payload.sub,
      avatar: payload.picture || null,
      isEmailVerified: true,
    });
  } else {
    user = await Auth.findByIdAndUpdate(
      user._id,
      {
        $set: {
          avatar: payload.picture || user.avatar,
          googleId: user.googleId || payload.sub,
          isEmailVerified: true,
          name: user.name || payload.name || normalizedEmail.split('@')[0],
          provider: user.provider === 'local' ? 'local' : 'google',
        },
      },
      { new: true },
    );
  }

  const session = await createOrReuseSession(user._id);
  setSessionCookie(res, session._id);

  res.status(200).json({
    success: true,
    message: 'User logged in with Google successfully',
    sessionId: session._id,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    },
  });
});

export const logout = asyncHandler(async (req, res) => {
  const sessionId = req.session?._id || getSessionIdFromRequest(req);

  if (sessionId && mongoose.isValidObjectId(sessionId)) {
    await Session.findByIdAndDelete(sessionId);
  }

  clearSessionCookie(res);

  res.status(200).json({
    success: true,
    message: 'User logged out successfully',
  });
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401);
  }

  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      avatar: req.user.avatar,
    },
  });
});
