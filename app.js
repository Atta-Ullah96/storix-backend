import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import authRoutes from './routes/auth.js';
import fileRoutes from './routes/file.js';
import folderRoutes from './routes/folder.js';
import UserRoutes from './routes/user.js'
import { errorHandler, notFoundHandler } from './middleware/error.js';
import helmet from 'helmet';

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet())
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/folder', folderRoutes);
app.use('/api/v1/file', fileRoutes);
app.use('/api/v1/user' ,UserRoutes )

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
