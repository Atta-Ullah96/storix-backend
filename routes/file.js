import express from 'express';
import {
  completeUpload,
  deleteFile,
  getFiles,
  renameFile,
  requestUpload,
} from '../controller/file.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, getFiles);
router.post('/request-upload', requireAuth, requestUpload);
router.post('/complete-upload', requireAuth, completeUpload);
router.patch('/:id/rename', requireAuth, renameFile);
router.delete('/:id', requireAuth, deleteFile);

export default router;
