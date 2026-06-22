import bcrypt from 'bcrypt';
import Auth from '../models/auth.js';
import { AppError, asyncHandler } from '../middleware/error.js';
import { verifyGoogleCredential } from '../services/googleAuth.js';
import {
  createOrReuseSession,
  deleteSessionById,
} from '../services/session.js';
import {
  clearSessionCookie,
  getSessionIdFromRequest,
  setSessionCookie,
} from '../utils/cookiesHandling.js';
import { loginSchema } from '../validator/auth.js';
import { getSystemSettings } from '../services/settings.js';

export const register = asyncHandler(async (req, res) => {
  const settings = await getSystemSettings();

  if (!settings.allowRegistration) {
    throw new AppError('Registration is currently disabled', 403);
  }

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
  const validateData = loginSchema.parse(req.body);

  const { email, password } = validateData;

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

  const { sessionId } = await createOrReuseSession(user._id);

  setSessionCookie(res, sessionId);

  res.status(200).json({
    success: true,
    message: 'User logged in successfully',
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

  const googleUser = await verifyGoogleCredential(googleToken);

  let user = await Auth.findOne({
    $or: [{ googleId: googleUser.googleId }, { email: googleUser.email }],
  });

  if (!user) {
    const settings = await getSystemSettings();

    if (!settings.allowRegistration) {
      throw new AppError('Registration is currently disabled', 403);
    }

    user = await Auth.create({
      name: googleUser.name,
      email: googleUser.email,
      provider: 'google',
      googleId: googleUser.googleId,
      avatar: googleUser.avatar,
      isEmailVerified: true,
      storageLimit: settings.defaultStorageLimit,
    });
  } else {
    user = await Auth.findByIdAndUpdate(
      user._id,
      {
        $set: {
          avatar: googleUser.avatar || user.avatar,
          googleId: user.googleId || googleUser.googleId,
          isEmailVerified: true,
          name: user.name || googleUser.name,
          provider: user.provider === 'local' ? 'local' : 'google',
        },
      },
      { new: true }
    );
  }

  const { sessionId } = await createOrReuseSession(user._id);
  setSessionCookie(res, sessionId);

  res.status(200).json({
    success: true,
    message: 'User logged in with Google successfully',
    sessionId,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    },
  });
});

export const logout = asyncHandler(async (req, res) => {
  const sessionId = req.session?.id || getSessionIdFromRequest(req);

  await deleteSessionById(sessionId);

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
      role: req.user.role
      
    },
  });
});





