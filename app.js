import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import authRoutes from './routes/auth.js';
import folderRoutes from './routes/folder.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/folder', folderRoutes);

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Google Drive Clone API is running',
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
