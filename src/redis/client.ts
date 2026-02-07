
import Redis from 'ioredis';
import { logger } from '../utils/logger';

export class RedisClient {
    private pub: Redis;
    private sub: Redis;

    constructor() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        this.pub = new Redis(redisUrl, {
            retryStrategy: (times) => Math.min(times * 50, 2000),
            lazyConnect: true // Don't crash if redis is missing in dev
        });

        this.sub = new Redis(redisUrl, {
            retryStrategy: (times) => Math.min(times * 50, 2000),
            lazyConnect: true
        });

        this.setupListeners();
    }

    private setupListeners() {
        this.pub.on('error', (err) => logger.warn('Redis Pub Error (ignorable in dev):', err.message));
        this.sub.on('error', (err) => logger.warn('Redis Sub Error (ignorable in dev):', err.message));

        this.pub.on('connect', () => logger.info('Redis Pub connected'));
        this.sub.on('connect', () => logger.info('Redis Sub connected'));
    }

    public async subscribe(pattern: string, callback: (message: string, channel: string) => void) {
        try {
            await this.sub.psubscribe(pattern);
            this.sub.on('pmessage', (_pattern, channel, message) => {
                if (_pattern === pattern) {
                    callback(message, channel);
                }
            });
        } catch (e) {
            logger.warn('Failed to subscribe to redis (is it running?)');
        }
    }

    public async disconnect() {
        await this.pub.quit();
        await this.sub.quit();
    }
}
