import 'dotenv/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { stripeWebhook } from './controller/billing.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { globalLimiter } from './middleware/rateLimitter.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import billingRoutes from './routes/billing.js';
import fileRoutes from './routes/file.js';
import folderRoutes from './routes/folder.js';
import userRoutes from './routes/user.js';

const app = express();

app.set('trust proxy', 1);
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhook
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(globalLimiter);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/folder', folderRoutes);
app.use('/api/v1/file', fileRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/admin', adminRoutes); 

app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Storix API is running',
  });
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
