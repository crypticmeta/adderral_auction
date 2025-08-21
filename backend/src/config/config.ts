/**
 * Application configuration module
 * Loads environment variables and provides centralized config access
 */

import dotenv from 'dotenv';

dotenv.config();

export default {
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET || 'adderrels_auction_secret_key',
  clientUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  socketIoSecret: process.env.SOCKET_IO_SECRET || 'adderrels_auction_socket_io_secret',
  rateLimit: parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || '60'),
  nodeEnv: process.env.NODE_ENV || 'development',
  // Testing mode: enables random confirmation results in tx checker
  testing: process.env.TESTING === 'true',
  // Bitcoin network for backend (must match frontend)
  btcNetwork: (process.env.BTC_NETWORK || 'mainnet') as 'mainnet' | 'testnet',
  // Single deposit address used for all pledges (set via env)
  depositAddress: process.env.BTC_DEPOSIT_ADDRESS || '',
  // Mempool API bases
  mempool: {
    mainnetBase: process.env.MEMPOOL_MAINNET_BASE || 'https://mempool.space/api',
    testnetBase: process.env.MEMPOOL_TESTNET_BASE || 'https://mempool.space/testnet/api'
  },
  database: {
    url: process.env.DATABASE_URL,
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    name: process.env.POSTGRES_DB || 'adderrels_auction',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password'
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || ''
  }
};
