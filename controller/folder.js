import mongoose from 'mongoose';
import Folder from '../models/folder.js';
import { AppError, asyncHandler } from '../middleware/error.js';

export const createFolder = asyncHandler(async (req, res) => {
  const { name, parentFolder = null } = req.body;

  if (!name?.trim()) {
    throw new AppError('Folder name is required', 400);
  }

  if (parentFolder && !mongoose.isValidObjectId(parentFolder)) {
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
