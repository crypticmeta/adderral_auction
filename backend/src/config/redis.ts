/**
 * Redis configuration and client initialization
 * Manages connection to Redis server for caching and pub/sub functionality
 */

import { Redis } from 'ioredis';
import config from './config';
import { logger } from '../utils/logger';

// Create Redis client
// Prefer full REDIS_URL when available to avoid localhost defaults in containers
const redisClient = config.redis?.url
  ? new Redis(config.redis.url)
  : new Redis({
      host: config.redis?.host ?? 'localhost',
      port: config.redis?.port ?? 6379,
      password: config.redis?.password || undefined,
    });

redisClient.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

redisClient.on('connect', () => {
  logger.info('Connected to Redis server');
});

// Export both as default and named export for flexibility
export { redisClient };
export default redisClient;
