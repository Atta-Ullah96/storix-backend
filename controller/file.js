import File from '../models/file.js';
import { AppError, asyncHandler } from '../middleware/error.js';
import { validateFolderAccess } from '../utils/folder.js';
import {
  createFileAccessUrl,
  createUploadUrl,
  deleteS3Object,
  getCloudFrontUrl,
  getS3Bucket,
  getS3ObjectMetadata,
} from '../services/s3.js';
import {
  createStorageKey,
  findUserFile,
  formatFileResponse,
  getFileExtension,
  isAllowedFileType,
  isValidFileSize,
} from '../utils/file.js';
import {
  getCloudFrontFileUrl,
  invalidateCloudFrontPath,
} from '../services/cloudFront.js';
import Auth from '../models/auth.js';
import { uploadFileSchema } from '../validator/file.js';
import { isValidMongoId } from '../utils/isValidMongodbId.js';

const EIGHT_GB = 8 * 1024 * 1024 * 1024;
export const requestUpload = asyncHandler(async (req, res) => {
  const { fileName, fileType, fileSize, folderId } = uploadFileSchema(req.body);

    if (!isValidMongoId(folderId)) {
        throw new AppError('Invalid parent folder id', 400);
      }

  if (!fileName || !fileType || !fileSize) {
    throw new AppError('File name, type and size are required', 400);
  }

  if (!isAllowedFileType(fileType)) {
    throw new AppError('This file type is not allowed', 400);
  }

  if (!isValidFileSize(fileSize)) {
    throw new AppError('File size is too large', 400);
  }
  const size = Number(fileSize);

  if (!Number.isFinite(size) || size <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid file size.',
    });
  }

  const user = await Auth.findById(req.user.id).select(
    'storageUsed storageLimit'
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found.',
    });
  }

  const storageUsed = user.storageUsed || 0;
  const storageLimit = user.storageLimit || EIGHT_GB;
  const remainingStorage = storageLimit - storageUsed;

  if (size > remainingStorage) {
    return res.status(403).json({
      success: false,
      message: 'Storage limit exceeded. You only have 8GB storage.',
      storage: {
        used: storageUsed,
        limit: storageLimit,
        remaining: Math.max(remainingStorage, 0),
        requested: size,
      },
    });
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

  if (!isValidMongoId(fileId)) {
      throw new AppError('Invalid file id', 400);
    }

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

  const user = await Auth.findById(req.user.id).select(
    'storageUsed storageLimit'
  );

  const storageUsed = user.storageUsed || 0;
  const storageLimit = user.storageLimit || 8 * 1024 * 1024 * 1024;
  const newStorageUsed = storageUsed + file.size;

  if (newStorageUsed > storageLimit) {
    return res.status(403).json({
      success: false,
      message: 'Storage limit exceeded.',
    });
  }

  file.status = 'completed';
  file.url = getCloudFrontUrl(file.storageKey);
  file.uploadedAt = new Date();

  await file.save();

  user.storageUsed = newStorageUsed;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'File uploaded successfully',
    file,
  });
});

export const getFiles = asyncHandler(async (req, res) => {
  const { folderId } = req.query;

    if (!isValidMongoId(folderId)) {
      throw new AppError('Invalid parent folder id', 400);
    }

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

export const downloadFile = asyncHandler(async (req, res) => {
  const { id } = req.params;

    if (!isValidMongoId(id)) {
      throw new AppError('Invalid id', 400);
    }

  const { redirect } = req.query;

  const file = await findUserFile({
    fileId: id,
    userId: req.user._id,
    status: 'completed',
    isTrashed: false,
  });

  const downloadUrl = await createFileAccessUrl({
    storageKey: file.storageKey,
    fileName: file.name,
    mimeType: file.mimeType,
  });

  if (redirect === 'true') {
    return res.redirect(downloadUrl);
  }

  return res.status(200).json({
    success: true,
    file: {
      id: file._id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      downloadUrl,
    },
  });
});

export const previewFile = asyncHandler(async (req, res) => {
  const { id } = req.params;
    if (!isValidMongoId(id)) {
      throw new AppError('Invalid  id', 400);
    }
  const { redirect } = req.query;

  const file = await findUserFile({
    fileId: id,
    userId: req.user._id,
    status: 'completed',
    isTrashed: false,
  });

  const previewUrl = getCloudFrontFileUrl(file?.storageKey);

  if (redirect === 'true') {
    return res.redirect(previewUrl);
  }

  return res.status(200).json({
    success: true,
    file: {
      id: file._id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      previewUrl,
    },
  });
});

export const renameFile = asyncHandler(async (req, res) => {
  const { id } = req.params;
    if (!isValidMongoId(id)) {
      throw new AppError('Invalid  id', 400);
    }
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
    if (!isValidMongoId(id)) {
      throw new AppError('Invalid  id', 400);
    }

  const file = await findUserFile({
    fileId: id,
    userId: req.user._id,
  });

  await deleteS3Object(file.storageKey);

  await File.deleteOne({
    _id: file._id,
    owner: req.user._id,
  });

     if (file.status === "completed") {
      const user = await Auth.findById(req.user.id).select("storageUsed");

      user.storageUsed = Math.max((user.storageUsed || 0) - file.size, 0);

      await user.save();
    }
  invalidateCloudFrontPath(file?.storageKey).catch((error) => {
    console.error('CloudFront invalidation failed:', error);
  });

  res.status(200).json({
    success: true,
    message: 'File deleted successfully',
  });
});
