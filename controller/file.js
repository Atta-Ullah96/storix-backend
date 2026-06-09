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
import {  getCloudFrontFileUrl, invalidateCloudFrontPath } from '../services/cloudFront.js';


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

export const downloadFile = asyncHandler(async (req, res) => {
  const { id } = req.params;
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
  const { redirect } = req.query;

  const file = await findUserFile({
    fileId: id,
    userId: req.user._id,
    status: "completed",
    isTrashed: false,
  });

  const previewUrl = getCloudFrontFileUrl(file?.storageKey);

  if (redirect === "true") {
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
   invalidateCloudFrontPath(file?.storageKey).catch((error) => {
      console.error("CloudFront invalidation failed:", error);
    });

  res.status(200).json({
    success: true,
    message: 'File deleted successfully',
  });
});


