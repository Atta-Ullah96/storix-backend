import crypto from 'crypto';
import path from 'path';
import File from '../models/file.js';
import { AppError } from '../middleware/error.js';
import { getCloudFrontUrl } from '../services/s3.js';

export const ALLOWED_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const getFileExtension = (fileName) =>
  path.extname(fileName).replace('.', '').toLowerCase();

export const sanitizeFileName = (fileName) =>
  fileName
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9.\-_]/g, '')
    .toLowerCase();

export const createStorageKey = ({ userId, folderId, fileName }) => {
  const uniqueId = crypto.randomUUID();
  const cleanName = sanitizeFileName(fileName);

  if (folderId) {
    return `users/${userId}/folders/${folderId}/${uniqueId}-${cleanName}`;
  }

  return `users/${userId}/root/${uniqueId}-${cleanName}`;
};

export const isAllowedFileType = (fileType) =>
  ALLOWED_FILE_TYPES.includes(fileType);

export const isValidFileSize = (fileSize) => Number(fileSize) <= MAX_FILE_SIZE;

export const findUserFile = async ({ fileId, userId, status, isTrashed }) => {
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

export const formatFileResponse = (file) => {
  const fileObject = file.toObject();

  return {
    ...fileObject,
    url: fileObject.url || getCloudFrontUrl(fileObject.storageKey),
  };
};


export const PREVIEW_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
];