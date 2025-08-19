/**
 * Redis configuration and client initialization
 * Manages connection to Redis server for caching and pub/sub functionality
 */

import { Redis } from 'ioredis';
import config from './config';

// Create Redis client
const redisClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
});

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redisClient.on('connect', () => {
  console.log('Connected to Redis server');
});

// Export both as default and named export for flexibility
export { redisClient };
export default redisClient;
