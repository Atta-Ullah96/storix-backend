import express from 'express';
import {
  createFolder,
  deleteFolder,
  getFolders,
  renameFolder,
} from '../controller/folder.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, getFolders);
router.post('/create', requireAuth, createFolder);
router.patch('/:folderId/rename', requireAuth, renameFolder);
router.delete('/:folderId', requireAuth, deleteFolder);

export default router;
