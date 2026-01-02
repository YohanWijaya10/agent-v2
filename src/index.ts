// Load environment variables FIRST
import './env';

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dashboardRoutes from './routes/dashboard';
import chatRoutes from './routes/chat';

const app: Application = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/chat', chatRoutes);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Inventory Dashboard API',
    version: '1.0.0',
    endpoints: {
      dashboard: '/api/dashboard/*',
      chat: '/api/chat',
      health: '/health'
    }
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server only when not running in Vercel serverless
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║   Inventory Dashboard Backend Server             ║
║   Running on: http://localhost:${PORT}            ║
║   Environment: ${process.env.NODE_ENV || 'development'}                      ║
╚═══════════════════════════════════════════════════╝
  `);
  });
}

export default app;
