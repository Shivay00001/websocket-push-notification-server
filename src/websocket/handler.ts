
import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { RedisClient } from '../redis/client';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

interface CustomWebSocket extends WebSocket {
    userId?: string;
    connectionId?: string;
    isAlive?: boolean;
}

export class WebSocketHandler {
    private wss: WebSocketServer;
    private redis: RedisClient;
    private clients: Map<string, CustomWebSocket> = new Map();

    constructor(wss: WebSocketServer, redis: RedisClient) {
        this.wss = wss;
        this.redis = redis;

        this.init();
    }

    private init() {
        this.wss.on('connection', (ws: CustomWebSocket, req: IncomingMessage) => {
            this.handleConnection(ws, req);
        });

        // Subscribe to Redis for fan-out messages
        this.redis.subscribe('notifications', (message) => {
            this.broadcast(message);
        });

        // Subscribe to specific user channels
        this.redis.subscribe('user-notifications:*', (message, channel) => {
            const userId = channel.split(':')[1];
            this.sendToUser(userId, message);
        });

        // Heartbeat
        setInterval(() => {
            this.wss.clients.forEach((ws: CustomWebSocket) => {
                if (ws.isAlive === false) return ws.terminate();
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);
    }

    private handleConnection(ws: CustomWebSocket, req: IncomingMessage) {
        // Auth could be done via upgrade req url params or headers
        // For simplicity, we assume a token in query param for demo
        // In prod, check req.headers['sec-websocket-protocol'] or cookie

        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const token = url.searchParams.get('token');

        // if (!token) { // Disabled for demo simplicity
        //   ws.close(1008, 'Token required');
        //   return;
        // }

        // try {
        //    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { sub: string };
        //    ws.userId = decoded.sub;
        // } catch (e) {
        //    ws.close(1008, 'Invalid token');
        //    return;
        // }

        ws.userId = url.searchParams.get('user_id') || 'anonymous'; // Fallback
        ws.connectionId = uuidv4();
        ws.isAlive = true;

        this.clients.set(ws.connectionId, ws);

        logger.info(`Client connected: ${ws.userId} (${ws.connectionId})`);

        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('message', (data) => {
            try {
                const parsed = JSON.parse(data.toString());
                // Handle client messages (e.g., echo, sub commands)
                // For now, just log
                logger.debug(`Received from ${ws.userId}:`, parsed);
            } catch (e) {
                logger.error('Failed to parse message', e);
            }
        });

        ws.on('close', () => {
            if (ws.connectionId) this.clients.delete(ws.connectionId);
            logger.info(`Client disconnected: ${ws.userId}`);
        });
    }

    private broadcast(message: string) {
        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    private sendToUser(userId: string, message: string) {
        this.wss.clients.forEach((client: CustomWebSocket) => {
            if (client.userId === userId && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    public close() {
        this.wss.close();
    }
}
