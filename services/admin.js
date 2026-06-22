import Auth from '../models/auth.js';
import File from '../models/file.js';
import Folder from '../models/folder.js';
import { AppError } from '../middleware/error.js';
import { deleteS3Object } from './s3.js';
import { deleteUserSessions } from './session.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const getPagination = (query) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(Number.parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

export const escapeRegex = (value = '') =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getUsagePercentage = (used = 0, limit = 0) =>
  limit > 0 ? Number(((used / limit) * 100).toFixed(2)) : 0;

export const deleteUserResources = async (userId) => {
  const files = await File.find({ owner: userId }).select('storageKey');
  const deletions = await Promise.allSettled(
    files.map((file) => deleteS3Object(file.storageKey)),
  );
  const failedS3Deletes = deletions.filter(
    (result) => result.status === 'rejected',
  );

  if (failedS3Deletes.length > 0) {
    throw new AppError(
      `Could not delete ${failedS3Deletes.length} file(s) from storage`,
      502,
    );
  }

  const [fileResult, folderResult, sessionCount] = await Promise.all([
    File.deleteMany({ owner: userId }),
    Folder.deleteMany({ user: userId }),
    deleteUserSessions(userId),
  ]);

  await Auth.deleteOne({ _id: userId });

  return {
    filesDeleted: fileResult.deletedCount,
    foldersDeleted: folderResult.deletedCount,
    sessionsDeleted: sessionCount,
  };
};
