import mongoose from 'mongoose';

const folderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Auth',
      required: true,
      index: true,
    },
    parentFolder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Folder',
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

folderSchema.index(
  { user: 1, parentFolder: 1, name: 1 },
  { unique: true },
);

const Folder = mongoose.model('Folder', folderSchema);

export default Folder;
