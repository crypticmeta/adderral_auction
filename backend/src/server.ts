/**
 * Main server entry point for the Adderrels Auction backend
 * Handles HTTP requests, WebSocket connections, and database initialization
 */

import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import config from './config/config';
import authRoutes from './routes/authRoutes';
import auctionRoutes from './routes/auctionRoutes';
import pledgeRoutes from './routes/pledgeRoutes';
import { initializeSocketIO } from './websocket/socketHandler';
import { setSocketServer } from './controllers/pledgeController';
import { setSocketServer as setAuctionSocketServer } from './controllers/auctionController';
import prisma from './config/prisma';
import { startAuctionTimeCheck, startBitcoinPriceRefresh, startTxConfirmationChecks } from './services/scheduledTasks';
import './config/redis'; // Initialize Redis connection

// Prisma client is initialized via singleton in config/prisma

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: config.clientUrl,
  credentials: true
}));
app.use(express.json());

// Initialize Socket.IO with Redis adapter
const io = initializeSocketIO(server);

// Set Socket.IO server in controllers
setSocketServer(io);
setAuctionSocketServer(io);

// Start scheduled tasks
startAuctionTimeCheck();
startBitcoinPriceRefresh();
startTxConfirmationChecks(io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/auction', auctionRoutes);
app.use('/api/pledges', pledgeRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message || 'Something went wrong'
  });
});

// Start server
server.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  console.log(`WebSocket server available at ws://localhost:${config.port}`);
  console.log('Scheduled tasks started: auction time check and Bitcoin price refresh');
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
