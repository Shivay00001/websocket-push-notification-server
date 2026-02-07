
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { WebSocketHandler } from './websocket/handler';
import { RedisClient } from './redis/client';
import { logger } from './utils/logger';
import promBundle from 'express-prom-bundle';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Metrics
const metricsMiddleware = promBundle({ includeMethod: true });
app.use(metricsMiddleware);

// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Redis Client
const redisClient = new RedisClient();

// WebSocket Handler
const wsHandler = new WebSocketHandler(wss, redisClient);

// Graceful Shutdown
const shutdown = async () => {
    logger.info('Shutting down server...');
    wsHandler.close();
    await redisClient.disconnect();
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});
