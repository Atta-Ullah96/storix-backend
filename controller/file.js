import File from '../models/file.js';
import Folder from '../models/folder.js';
import { AppError, asyncHandler } from '../middleware/error.js';
import {
  createUploadUrl,
  deleteS3Object,
  getCloudFrontUrl,
  getS3Bucket,
  getS3ObjectMetadata,
} from '../services/s3.js';
import {
  createStorageKey,
  getFileExtension,
  isAllowedFileType,
  isValidFileSize,
} from '../utils/file.js';

const findUserFile = async ({ fileId, userId, status, isTrashed }) => {
  const query = {
    _id: fileId,
    owner: userId,
  };

  if (status) {
    query.status = status;
  }

  if (typeof isTrashed === 'boolean') {
    query.isTrashed = isTrashed;
  }

  const file = await File.findOne(query);

  if (!file) {
    throw new AppError('File not found', 404);
  }

  return file;
};

const validateFolderAccess = async ({ folderId, userId }) => {
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

const formatFileResponse = (file) => {
  const fileObject = file.toObject();

  return {
    ...fileObject,
    url: fileObject.url || getCloudFrontUrl(fileObject.storageKey),
  };
};

export const requestUpload = asyncHandler(async (req, res) => {
  const { fileName, fileType, fileSize, folderId } = req.body;

  if (!fileName || !fileType || !fileSize) {
    throw new AppError('File name, type and size are required', 400);
  }

  if (!isAllowedFileType(fileType)) {
    throw new AppError('This file type is not allowed', 400);
  }

  if (!isValidFileSize(fileSize)) {
    throw new AppError('File size is too large', 400);
  }

  const parentFolderId = await validateFolderAccess({
    folderId,
    userId: req.user._id,
  });

  const storageKey = createStorageKey({
    userId: req.user._id,
    folderId: parentFolderId,
    fileName,
  });

  const file = await File.create({
    name: fileName,
    originalName: fileName,
    mimeType: fileType,
    extension: getFileExtension(fileName),
    size: Number(fileSize),
    owner: req.user._id,
    folder: parentFolderId,
    storageProvider: 's3',
    bucket: getS3Bucket(),
    storageKey,
    url: null,
    status: 'pending',
  });

  const uploadUrl = await createUploadUrl({
    storageKey,
    fileType,
  });

  res.status(201).json({
    success: true,
    message: 'Upload URL created successfully',
    fileId: file._id,
    uploadUrl,
    storageKey,
  });
});

export const completeUpload = asyncHandler(async (req, res) => {
  const { fileId } = req.body;

  if (!fileId) {
    throw new AppError('File ID is required', 400);
  }

  const file = await findUserFile({
    fileId,
    userId: req.user._id,
    status: 'pending',
  });

  let s3Object;

  try {
    s3Object = await getS3ObjectMetadata(file.storageKey);
  } catch {
    file.status = 'failed';
    await file.save();

    throw new AppError('File was not uploaded to S3', 400);
  }

  if (Number(s3Object.ContentLength) !== Number(file.size)) {
    file.status = 'failed';
    await file.save();

    throw new AppError('Uploaded file size does not match', 400);
  }

  file.status = 'completed';
  file.url = getCloudFrontUrl(file.storageKey);
  file.uploadedAt = new Date();

  await file.save();

  res.status(200).json({
    success: true,
    message: 'File uploaded successfully',
    file,
  });
});

export const getFiles = asyncHandler(async (req, res) => {
  const { folderId } = req.query;
  const parentFolderId = await validateFolderAccess({
    folderId,
    userId: req.user._id,
  });

  const files = await File.find({
    owner: req.user._id,
    folder: parentFolderId,
    status: 'completed',
    isTrashed: false,
  }).sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: files.length,
    files: files.map(formatFileResponse),
  });
});

export const renameFile = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name?.trim()) {
    throw new AppError('File name is required', 400);
  }

  const file = await findUserFile({
    fileId: id,
    userId: req.user._id,
    isTrashed: false,
  });

  file.name = name.trim();
  await file.save();

  res.status(200).json({
    success: true,
    message: 'File renamed successfully',
    file,
  });
});

export const deleteFile = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const file = await findUserFile({
    fileId: id,
    userId: req.user._id,
  });

  await deleteS3Object(file.storageKey);

  await File.deleteOne({
    _id: file._id,
    owner: req.user._id,
  });

  res.status(200).json({
    success: true,
    message: 'File deleted successfully',
  });
});
