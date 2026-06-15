import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import authRoutes from './routes/auth.js';
import fileRoutes from './routes/file.js';
import folderRoutes from './routes/folder.js';
import UserRoutes from './routes/user.js'
import { errorHandler, notFoundHandler } from './middleware/error.js';
import helmet from 'helmet';
import { globalLimiter } from './middleware/rateLimitter.js';
import cookieParser from "cookie-parser";

const app = express();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet({
  crossOriginResourcePolicy:false,
}))
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);
app.set("trust proxy", 1);
app.use(globalLimiter)
app.use(cookieParser());


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
