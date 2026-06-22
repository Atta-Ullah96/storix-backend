import ActivityLog from '../models/activityLog.js';

export const logActivity = async ({
  user = null,
  action,
  entityType,
  entityId = null,
  status = 'success',
  message = '',
  details = null,
  req = null,
}) => {
  try {
    return await ActivityLog.create({
      user,
      action,
      entityType,
      entityId,
      status,
      message,
      details,
      ip: req?.ip || null,
      userAgent: req?.get?.('user-agent') || null,
    });
  } catch (error) {
    console.error('Activity logging failed:', error.message);
    return null;
  }
};
