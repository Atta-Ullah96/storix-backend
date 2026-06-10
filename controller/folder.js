import Folder from '../models/folder.js';
import { AppError, asyncHandler } from '../middleware/error.js';
import { deleteFolderTree } from '../services/folder.js';
import { createFolderSchema } from '../validator/folder.js';
import { isValidMongoId } from '../utils/isValidMongodbId.js';

export const createFolder = asyncHandler(async (req, res) => {
  const { name, parentFolder = null } = createFolderSchema(req.body);

  if (!name?.trim()) {
    throw new AppError('Folder name is required', 400);
  }

  if (parentFolder && !isValidMongoId(parentFolder)) {
    throw new AppError('Invalid parent folder id', 400);
  }

  if (parentFolder) {
    const parent = await Folder.findOne({
      _id: parentFolder,
      user: req.user._id,
    });

    if (!parent) {
      throw new AppError('Parent folder not found', 404);
    }
  }

  const existingFolder = await Folder.findOne({
    name: name.trim(),
    user: req.user._id,
    parentFolder,
  });

  if (existingFolder) {
    throw new AppError('Folder already exists in this location', 409);
  }

  const folder = await Folder.create({
    name: name.trim(),
    user: req.user._id,
    parentFolder,
  });

  res.status(201).json({
    success: true,
    message: 'Folder created successfully',
    folder,
  });
});

export const getFolders = asyncHandler(async (req, res) => {
  const { parentFolder } = req.query;
  let folderParent = null;

  if (parentFolder) {
    if (!isValidMongoId(parentFolder)) {
      throw new AppError('Invalid parent folder id', 400);
    }

    const parent = await Folder.findOne({
      _id: parentFolder,
      user: req.user._id,
    });

    if (!parent) {
      throw new AppError('Parent folder not found', 404);
    }

    folderParent = parentFolder;
  }

  const folders = await Folder.find({
    user: req.user._id,
    parentFolder: folderParent,
  }).sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: folders.length,
    folders,
  });
});

export const renameFolder = asyncHandler(async (req, res) => {
  const { folderId } = req.params;
  const { name } = req.body;

  if (!isValidMongoId(folderId)) {
    throw new AppError('Invalid folder id', 400);
  }

  if (!name?.trim()) {
    throw new AppError('Folder name is required', 400);
  }

  const folder = await Folder.findOne({
    _id: folderId,
    user: req.user._id,
  });

  if (!folder) {
    throw new AppError('Folder not found', 404);
  }

  const existingFolder = await Folder.findOne({
    _id: { $ne: folder._id },
    name: name.trim(),
    user: req.user._id,
    parentFolder: folder.parentFolder,
  });

  if (existingFolder) {
    throw new AppError('Folder already exists in this location', 409);
  }

  folder.name = name.trim();
  await folder.save();

  res.status(200).json({
    success: true,
    message: 'Folder renamed successfully',
    folder,
  });
});

export const deleteFolder = asyncHandler(async (req, res) => {
  const { folderId } = req.params;

  if (!isValidMongoId(folderId)) {
    throw new AppError('Invalid folder id', 400);
  }

  const folder = await Folder.findOne({
    _id: folderId,
    user: req.user._id,
  });

  if (!folder) {
    throw new AppError('Folder not found', 404);
  }

  const deletedCount = await deleteFolderTree(folder._id, req.user._id);

  res.status(200).json({
    success: true,
    message: 'Folder deleted successfully',
    deletedCount,
  });
});
