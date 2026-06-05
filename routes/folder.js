import express from 'express';
import { createFolder } from '../controller/folder.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/', requireAuth, createFolder);

export default router;
