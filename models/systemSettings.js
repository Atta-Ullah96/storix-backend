import mongoose from 'mongoose';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from '../utils/file.js';

const systemSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'global',
      unique: true,
      immutable: true,
    },
    defaultStorageLimit: {
      type: Number,
      default: 8 * 1024 * 1024 * 1024,
      min: 1,
    },
    maxFileUploadSize: {
      type: Number,
      default: MAX_FILE_SIZE,
      min: 1,
    },
    allowedFileTypes: {
      type: [String],
      default: () => [...ALLOWED_FILE_TYPES],
    },
    storageWarningThreshold: {
      type: Number,
      default: 80,
      min: 1,
      max: 100,
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
    allowRegistration: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);

export default SystemSettings;
