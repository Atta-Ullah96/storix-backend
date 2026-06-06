import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'File name is required'],
      trim: true,
    },

    originalName: {
      type: String,
      required: [true, 'Original file name is required'],
      trim: true,
    },

    mimeType: {
      type: String,
      required: [true, 'File type is required'],
    },

    extension: {
      type: String,
      default: '',
      lowercase: true,
      trim: true,
    },

    size: {
      type: Number,
      required: [true, 'File size is required'],
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Auth',
      required: true,
      index: true,
    },

    folder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Folder',
      default: null,
      index: true,
    },

    storageProvider: {
      type: String,
      enum: ['s3'],
      default: 's3',
    },

    bucket: {
      type: String,
      required: true,
    },

    storageKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    url: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },

    uploadedAt: {
      type: Date,
      default: null,
    },

    isStarred: {
      type: Boolean,
      default: false,
    },

    isTrashed: {
      type: Boolean,
      default: false,
      index: true,
    },

    trashedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

fileSchema.index({ owner: 1, folder: 1, status: 1, isTrashed: 1 });
fileSchema.index({ owner: 1, name: 1, folder: 1 });

export default mongoose.model('File', fileSchema);
