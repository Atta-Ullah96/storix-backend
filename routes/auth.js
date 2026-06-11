import express from 'express';
import {
  continueWithGoogle,
  getCurrentUser,
  login,
  logout,
  register,
} from '../controller/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimitter.js';

const router = express.Router();

router.post('/register', register);
router.post('/login',authLimiter, login);
router.post('/google', continueWithGoogle);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, getCurrentUser);

export default router;
