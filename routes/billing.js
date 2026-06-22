import { Router } from 'express';
import {
  cancelSubscription,
  checkout,
  getMySubscription,
  portal,
  resumeSubscription,
} from '../controller/billing.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.post('/create-checkout-session', checkout);
router.post('/create-portal-session', portal);
router.get('/my-subscription', getMySubscription);
router.post('/cancel-subscription', cancelSubscription);
router.post('/resume-subscription', resumeSubscription);

export default router;
