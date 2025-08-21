// env.ts
// Purpose: Centralized frontend runtime config (Next.js public envs)
// Usage: import { env } from "@/config/env";
// Null-safety: Provides sane defaults for dev; do not hardcode secrets.

export type AppEnv = 'development' | 'staging' | 'production' | string;

export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:5000',
  appEnv: (process.env.NEXT_PUBLIC_APP_ENV || 'development') as AppEnv,
  testing: process.env.NEXT_PUBLIC_TESTING === 'true',
  btcNetwork: (process.env.NEXT_PUBLIC_BTC_NETWORK || 'mainnet') as 'mainnet' | 'testnet',
} as const;
