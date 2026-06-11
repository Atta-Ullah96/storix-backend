import express from 'express';
import {
  completeUpload,
  deleteFile,
  downloadFile,
  getFiles,
  previewFile,
  renameFile,
  requestUpload,
} from '../controller/file.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimitter.js';

const router = express.Router();

router.get('/', requireAuth, getFiles);
router.get('/:id/preview' , requireAuth , previewFile)
router.post('/request-upload', requireAuth,uploadLimiter, requestUpload);
router.post('/complete-upload', requireAuth, completeUpload);
router.get('/:id/download', requireAuth, downloadFile);
router.patch('/:id/rename', requireAuth, renameFile);
router.delete('/:id', requireAuth, deleteFile);

export default router;
