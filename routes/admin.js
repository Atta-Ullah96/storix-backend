import { Router } from 'express';
import {
  deleteAdminFile,
  deleteUser,
  getActivity,
  getAdminFileDetails,
  getAdminFiles,
  getHealth,
  getOverview,
  getSettings,
  getStorageAnalytics,
  getUserDetails,
  getUsers,
  updateSettings,
  updateUserRole,
  updateUserStatus,
  updateUserStorageLimit,
} from '../controller/admin.js';
import {
  getPayments,
  getSubscriptionDetails,
  getSubscriptions,
  getSubscriptionStats,
} from '../controller/billingAdmin.js';
import { requireAdmin } from '../middleware/admin.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/overview', getOverview);
router.get('/subscription-stats', getSubscriptionStats);
router.get('/subscriptions', getSubscriptions);
router.get('/subscriptions/:id', getSubscriptionDetails);
router.get('/payments', getPayments);
router.get('/users', getUsers);
router.get('/users/:id', getUserDetails);
router.patch('/users/:id/status', updateUserStatus);
router.patch('/users/:id/role', updateUserRole);
router.patch('/users/:id/storage-limit', updateUserStorageLimit);
router.delete('/users/:id', deleteUser);

router.get('/storage', getStorageAnalytics);

router.get('/files', getAdminFiles);
router.get('/files/:id', getAdminFileDetails);
router.delete('/files/:id', deleteAdminFile);

router.get('/activity', getActivity);
router.get('/health', getHealth);
router.get('/settings', getSettings);
router.patch('/settings', updateSettings);

export default router;
