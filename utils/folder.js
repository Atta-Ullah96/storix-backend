import Folder from '../models/folder.js';
import { AppError } from '../middleware/error.js';

export const validateFolderAccess = async ({ folderId, userId }) => {
  if (!folderId) {
    return null;
  }

  const folder = await Folder.findOne({
    _id: folderId,
    user: userId,
  });

  if (!folder) {
    throw new AppError('Folder not found', 404);
  }

  return folder._id;
};
