import mongoose from 'mongoose';
import ActivityLog from '../models/activityLog.js';
import Auth from '../models/auth.js';
import File from '../models/file.js';
import Folder from '../models/folder.js';
import { redisClient } from '../config/redis.js';
import { AppError, asyncHandler } from '../middleware/error.js';
import {
  deleteUserResources,
  escapeRegex,
  getPagination,
  getUsagePercentage,
} from '../services/admin.js';
import { logActivity } from '../services/activity.js';
import { deleteS3Object } from '../services/s3.js';
import { getSystemSettings } from '../services/settings.js';
import { deleteUserSessions } from '../services/session.js';
import { isValidMongoId } from '../utils/isValidMongodbId.js';

const USER_SORT_FIELDS = new Set([
  'createdAt',
  'lastActiveAt',
  'storageUsed',
  'storageLimit',
]);
const FILE_SORT_FIELDS = new Set(['size', 'createdAt', 'uploadedAt']);

const getSort = (field, order, allowedFields, fallback = 'createdAt') => ({
  [allowedFields.has(field) ? field : fallback]: order === 'asc' ? 1 : -1,
});

const getBasicSystemStatus = () => ({
  backend: 'operational',
  mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  redis: redisClient.isReady ? 'connected' : 'disconnected',
  s3: process.env.AWS_REGION && process.env.AWS_S3_BUCKET
    ? 'configured'
    : 'not_configured',
});

const ensureValidId = (id, label = 'resource') => {
  if (!isValidMongoId(id)) {
    throw new AppError(`Invalid ${label} id`, 400);
  }
};

const ensureNotLastAdmin = async (user) => {
  if (user.role !== 'admin') {
    return;
  }

  const [totalAdminCount, activeAdminCount] = await Promise.all([
    Auth.countDocuments({ role: 'admin' }),
    Auth.countDocuments({ role: 'admin', status: 'active' }),
  ]);

  if (
    totalAdminCount <= 1 ||
    (user.status === 'active' && activeAdminCount <= 1)
  ) {
    throw new AppError('The last active admin cannot be removed or blocked', 409);
  }
};

export const getOverview = asyncHandler(async (_req, res) => {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [
    totalUsers,
    activeUsers,
    blockedUsers,
    adminUsers,
    newUsersThisMonth,
    totalFiles,
    totalFolders,
    fileStorage,
    storageLimit,
    topStorageUsers,
    recentUsers,
    recentFiles,
  ] = await Promise.all([
    Auth.countDocuments(),
    Auth.countDocuments({ status: 'active' }),
    Auth.countDocuments({ status: 'blocked' }),
    Auth.countDocuments({ role: 'admin' }),
    Auth.countDocuments({ createdAt: { $gte: monthStart } }),
    File.countDocuments({ status: 'completed', isTrashed: false }),
    Folder.countDocuments(),
    File.aggregate([
      { $match: { status: 'completed', isTrashed: false } },
      { $group: { _id: null, total: { $sum: '$size' } } },
    ]),
    Auth.aggregate([
      { $group: { _id: null, total: { $sum: '$storageLimit' } } },
    ]),
    Auth.find()
      .sort({ storageUsed: -1 })
      .limit(5)
      .select('name email avatar storageUsed storageLimit'),
    Auth.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email avatar role status storageUsed storageLimit createdAt'),
    File.find({ status: 'completed', isTrashed: false })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name originalName mimeType size owner folder status createdAt uploadedAt')
      .populate('owner', 'name email avatar')
      .populate('folder', 'name'),
  ]);

  const totalStorageUsed = fileStorage[0]?.total || 0;
  const totalStorageLimit = storageLimit[0]?.total || 0;

  res.status(200).json({
    success: true,
    message: 'Admin overview retrieved successfully',
    data: {
      totalUsers,
      activeUsers,
      blockedUsers,
      adminUsers,
      newUsersThisMonth,
      totalFiles,
      totalFolders,
      totalStorageUsed,
      totalStorageLimit,
      averageStoragePerUser: totalUsers > 0 ? totalStorageUsed / totalUsers : 0,
      topStorageUsers: topStorageUsers.map((user) => ({
        ...user.toObject(),
        usagePercentage: getUsagePercentage(user.storageUsed, user.storageLimit),
      })),
      recentUsers,
      recentFiles,
      systemStatus: getBasicSystemStatus(),
    },
  });
});

export const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const match = {};

  if (req.query.search?.trim()) {
    const search = new RegExp(escapeRegex(req.query.search.trim()), 'i');
    match.$or = [{ name: search }, { email: search }];
  }

  if (['active', 'blocked'].includes(req.query.status)) {
    match.status = req.query.status;
  }

  if (['user', 'admin'].includes(req.query.role)) {
    match.role = req.query.role;
  }

  const sort = getSort(
    req.query.sort,
    req.query.order,
    USER_SORT_FIELDS,
  );
  const [result] = await Auth.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'files',
        localField: '_id',
        foreignField: 'owner',
        as: 'files',
      },
    },
    {
      $lookup: {
        from: 'folders',
        localField: '_id',
        foreignField: 'user',
        as: 'folders',
      },
    },
    {
      $addFields: {
        filesCount: { $size: '$files' },
        foldersCount: { $size: '$folders' },
        usagePercentage: {
          $cond: [
            { $gt: ['$storageLimit', 0] },
            {
              $round: [
                { $multiply: [{ $divide: ['$storageUsed', '$storageLimit'] }, 100] },
                2,
              ],
            },
            0,
          ],
        },
      },
    },
    { $sort: sort },
    {
      $facet: {
        users: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              name: 1,
              email: 1,
              avatar: 1,
              role: 1,
              status: 1,
              storageUsed: 1,
              storageLimit: 1,
              usagePercentage: 1,
              filesCount: 1,
              foldersCount: 1,
              createdAt: 1,
              lastActiveAt: 1,
            },
          },
        ],
        metadata: [{ $count: 'total' }],
      },
    },
  ]);

  const total = result.metadata[0]?.total || 0;

  res.status(200).json({
    success: true,
    message: 'Users retrieved successfully',
    data: {
      users: result.users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

export const getUserDetails = asyncHandler(async (req, res) => {
  ensureValidId(req.params.id, 'user');

  const user = await Auth.findById(req.params.id).select('-password');

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const [filesCount, foldersCount, fileStorage, recentFiles, largestFiles, recentActivity] =
    await Promise.all([
      File.countDocuments({ owner: user._id }),
      Folder.countDocuments({ user: user._id }),
      File.aggregate([
        { $match: { owner: user._id, status: 'completed', isTrashed: false } },
        { $group: { _id: null, total: { $sum: '$size' } } },
      ]),
      File.find({ owner: user._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('name originalName mimeType size folder status createdAt uploadedAt')
        .populate('folder', 'name'),
      File.find({ owner: user._id, status: 'completed', isTrashed: false })
        .sort({ size: -1 })
        .limit(10)
        .select('name originalName mimeType size folder createdAt')
        .populate('folder', 'name'),
      ActivityLog.find({ user: user._id })
        .sort({ createdAt: -1 })
        .limit(10),
    ]);

  const actualStorageUsed = fileStorage[0]?.total || 0;

  res.status(200).json({
    success: true,
    message: 'User details retrieved successfully',
    data: {
      user,
      storage: {
        used: actualStorageUsed,
        recordedUsed: user.storageUsed || 0,
        limit: user.storageLimit || 0,
        remaining: Math.max((user.storageLimit || 0) - actualStorageUsed, 0),
        usagePercentage: getUsagePercentage(actualStorageUsed, user.storageLimit),
      },
      filesCount,
      foldersCount,
      recentFiles,
      largestFiles,
      recentActivity,
    },
  });
});

export const updateUserStatus = asyncHandler(async (req, res) => {
  ensureValidId(req.params.id, 'user');
  const { status } = req.body;

  if (!['active', 'blocked'].includes(status)) {
    throw new AppError('Status must be active or blocked', 400);
  }

  if (req.user._id.toString() === req.params.id && status === 'blocked') {
    throw new AppError('You cannot block your own account', 409);
  }

  const user = await Auth.findById(req.params.id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (status === 'blocked') {
    await ensureNotLastAdmin(user);
  }

  user.status = status;
  await user.save();

  if (status === 'blocked') {
    await deleteUserSessions(user._id);
  }
  await logActivity({
    user: req.user._id,
    action: 'user_status_updated',
    entityType: 'user',
    entityId: user._id,
    message: `User status changed to ${status}`,
    details: { status },
    req,
  });

  res.status(200).json({
    success: true,
    message: 'User status updated successfully',
    data: { user },
  });
});

export const updateUserRole = asyncHandler(async (req, res) => {
  ensureValidId(req.params.id, 'user');
  const { role } = req.body;

  if (!['user', 'admin'].includes(role)) {
    throw new AppError('Role must be user or admin', 400);
  }

  const user = await Auth.findById(req.params.id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.role === 'admin' && role === 'user') {
    await ensureNotLastAdmin(user);
  }

  user.role = role;
  await user.save();
  await logActivity({
    user: req.user._id,
    action: 'user_role_updated',
    entityType: 'user',
    entityId: user._id,
    message: `User role changed to ${role}`,
    details: { role },
    req,
  });

  res.status(200).json({
    success: true,
    message: 'User role updated successfully',
    data: { user },
  });
});

export const updateUserStorageLimit = asyncHandler(async (req, res) => {
  ensureValidId(req.params.id, 'user');
  const storageLimit = Number(req.body.storageLimit);

  if (!Number.isFinite(storageLimit) || storageLimit <= 0) {
    throw new AppError('Storage limit must be a positive number of bytes', 400);
  }

  const user = await Auth.findByIdAndUpdate(
    req.params.id,
    { $set: { storageLimit } },
    { new: true, runValidators: true },
  );

  if (!user) {
    throw new AppError('User not found', 404);
  }

  await logActivity({
    user: req.user._id,
    action: 'user_storage_limit_updated',
    entityType: 'user',
    entityId: user._id,
    message: 'User storage limit updated',
    details: { storageLimit },
    req,
  });

  res.status(200).json({
    success: true,
    message: 'User storage limit updated successfully',
    data: { user },
  });
});

export const deleteUser = asyncHandler(async (req, res) => {
  ensureValidId(req.params.id, 'user');

  if (req.user._id.toString() === req.params.id) {
    throw new AppError('You cannot delete your own account', 409);
  }

  const user = await Auth.findById(req.params.id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  await ensureNotLastAdmin(user);
  const cleanup = await deleteUserResources(user._id);
  await logActivity({
    user: req.user._id,
    action: 'user_deleted',
    entityType: 'user',
    entityId: user._id,
    message: 'User and owned resources deleted',
    details: cleanup,
    req,
  });

  res.status(200).json({
    success: true,
    message: 'User deleted successfully',
    data: cleanup,
  });
});

export const getStorageAnalytics = asyncHandler(async (_req, res) => {
  const [
    totalUsers,
    totalFiles,
    totalFolders,
    storageUsed,
    storageLimit,
    topStorageUsers,
    usersNearQuota,
    fileTypeBreakdown,
    largeFiles,
  ] = await Promise.all([
    Auth.countDocuments(),
    File.countDocuments({ status: 'completed', isTrashed: false }),
    Folder.countDocuments(),
    File.aggregate([
      { $match: { status: 'completed', isTrashed: false } },
      { $group: { _id: null, total: { $sum: '$size' } } },
    ]),
    Auth.aggregate([
      { $group: { _id: null, total: { $sum: '$storageLimit' } } },
    ]),
    Auth.find()
      .sort({ storageUsed: -1 })
      .limit(10)
      .select('name email avatar storageUsed storageLimit'),
    Auth.aggregate([
      { $match: { storageLimit: { $gt: 0 } } },
      {
        $addFields: {
          usagePercentage: {
            $multiply: [{ $divide: ['$storageUsed', '$storageLimit'] }, 100],
          },
        },
      },
      { $match: { usagePercentage: { $gte: 80 } } },
      { $sort: { usagePercentage: -1 } },
      { $limit: 20 },
      {
        $project: {
          name: 1,
          email: 1,
          avatar: 1,
          storageUsed: 1,
          storageLimit: 1,
          usagePercentage: { $round: ['$usagePercentage', 2] },
        },
      },
    ]),
    File.aggregate([
      { $match: { status: 'completed', isTrashed: false } },
      {
        $group: {
          _id: '$mimeType',
          filesCount: { $sum: 1 },
          totalSize: { $sum: '$size' },
        },
      },
      { $sort: { totalSize: -1 } },
      { $project: { _id: 0, mimeType: '$_id', filesCount: 1, totalSize: 1 } },
    ]),
    File.find({ status: 'completed', isTrashed: false })
      .sort({ size: -1 })
      .limit(20)
      .select('name originalName mimeType size owner folder createdAt uploadedAt')
      .populate('owner', 'name email avatar')
      .populate('folder', 'name'),
  ]);

  const totalStorageUsed = storageUsed[0]?.total || 0;
  const totalStorageLimit = storageLimit[0]?.total || 0;

  res.status(200).json({
    success: true,
    message: 'Storage analytics retrieved successfully',
    data: {
      totalStorageUsed,
      totalStorageLimit,
      averageStoragePerUser: totalUsers > 0 ? totalStorageUsed / totalUsers : 0,
      topStorageUsers: topStorageUsers.map((user) => ({
        ...user.toObject(),
        usagePercentage: getUsagePercentage(user.storageUsed, user.storageLimit),
      })),
      usersNearQuota,
      usersOver80Percent: usersNearQuota.length,
      fileTypeBreakdown,
      largeFiles,
      totalFiles,
      totalFolders,
    },
  });
});

export const getAdminFiles = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (req.query.search?.trim()) {
    const search = new RegExp(escapeRegex(req.query.search.trim()), 'i');
    filter.$or = [{ name: search }, { originalName: search }];
  }

  if (req.query.type?.trim()) {
    filter.mimeType = new RegExp(escapeRegex(req.query.type.trim()), 'i');
  }

  if (req.query.user) {
    ensureValidId(req.query.user, 'user');
    filter.owner = req.query.user;
  }

  const sort = getSort(req.query.sort, req.query.order, FILE_SORT_FIELDS);
  const [files, total] = await Promise.all([
    File.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select('-bucket')
      .populate('owner', 'name email avatar role status')
      .populate('folder', 'name parentFolder'),
    File.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    message: 'Files retrieved successfully',
    data: {
      files,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

export const getAdminFileDetails = asyncHandler(async (req, res) => {
  ensureValidId(req.params.id, 'file');

  const file = await File.findById(req.params.id)
    .select('-bucket')
    .populate('owner', 'name email avatar role status storageUsed storageLimit')
    .populate('folder', 'name parentFolder');

  if (!file) {
    throw new AppError('File not found', 404);
  }

  res.status(200).json({
    success: true,
    message: 'File details retrieved successfully',
    data: { file },
  });
});

export const deleteAdminFile = asyncHandler(async (req, res) => {
  ensureValidId(req.params.id, 'file');

  const file = await File.findById(req.params.id);

  if (!file) {
    throw new AppError('File not found', 404);
  }

  await deleteS3Object(file.storageKey);
  await File.deleteOne({ _id: file._id });

  if (file.status === 'completed') {
    await Auth.updateOne(
      { _id: file.owner },
      [
        {
          $set: {
            storageUsed: {
              $max: [
                0,
                { $subtract: [{ $ifNull: ['$storageUsed', 0] }, file.size] },
              ],
            },
          },
        },
      ],
    );
  }

  await logActivity({
    user: req.user._id,
    action: 'file_deleted',
    entityType: 'file',
    entityId: file._id,
    message: 'File deleted by admin',
    details: { owner: file.owner, name: file.name, size: file.size },
    req,
  });

  res.status(200).json({
    success: true,
    message: 'File deleted successfully',
  });
});

export const getActivity = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (req.query.search?.trim()) {
    const search = new RegExp(escapeRegex(req.query.search.trim()), 'i');
    filter.$or = [{ action: search }, { message: search }, { entityType: search }];
  }

  if (req.query.action?.trim()) {
    filter.action = req.query.action.trim();
  }

  if (req.query.user) {
    ensureValidId(req.query.user, 'user');
    filter.user = req.query.user;
  }

  if (['success', 'failed'].includes(req.query.status)) {
    filter.status = req.query.status;
  }

  if (req.query.from || req.query.to) {
    filter.createdAt = {};

    if (req.query.from) {
      const from = new Date(req.query.from);
      if (Number.isNaN(from.getTime())) throw new AppError('Invalid from date', 400);
      filter.createdAt.$gte = from;
    }

    if (req.query.to) {
      const to = new Date(req.query.to);
      if (Number.isNaN(to.getTime())) throw new AppError('Invalid to date', 400);
      filter.createdAt.$lte = to;
    }
  }

  const [activity, total] = await Promise.all([
    ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email avatar role'),
    ActivityLog.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    message: 'Activity retrieved successfully',
    data: {
      activity,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

export const getHealth = asyncHandler(async (_req, res) => {
  const memory = process.memoryUsage();

  res.status(200).json({
    success: true,
    message: 'System health retrieved successfully',
    data: {
      status: 'operational',
      services: getBasicSystemStatus(),
      uptime: process.uptime(),
      memory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external,
      },
      timestamp: new Date().toISOString(),
    },
  });
});

export const getSettings = asyncHandler(async (_req, res) => {
  const settings = await getSystemSettings();

  res.status(200).json({
    success: true,
    message: 'Settings retrieved successfully',
    data: { settings },
  });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await getSystemSettings();
  const allowedFields = [
    'defaultStorageLimit',
    'maxFileUploadSize',
    'allowedFileTypes',
    'storageWarningThreshold',
    'maintenanceMode',
    'allowRegistration',
  ];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      settings[field] = req.body[field];
    }
  }

  await settings.save();
  await logActivity({
    user: req.user._id,
    action: 'settings_updated',
    entityType: 'settings',
    entityId: settings._id,
    message: 'System settings updated',
    details: req.body,
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Settings updated successfully',
    data: { settings },
  });
});

