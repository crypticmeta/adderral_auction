// File: backend/src/utils/logger.ts | Purpose: Minimal logger with level control; quiet in test to reduce noise

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const levelOrder: Record<Exclude<LogLevel, 'silent'>, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const resolveLevel = (): LogLevel => {
  // In tests, default to fully silent unless explicitly overridden
  if (process.env.NODE_ENV === 'test') {
    return (process.env.LOG_LEVEL as LogLevel) || 'silent';
  }
  return (process.env.LOG_LEVEL as LogLevel) || 'info';
};

let currentLevel = resolveLevel();

export const setLogLevel = (lvl: LogLevel) => {
  currentLevel = lvl;
};

const enabled = (lvl: Exclude<LogLevel, 'silent'>) => {
  if (currentLevel === 'silent') return false;
  const threshold = currentLevel === 'debug' ? 3 : currentLevel === 'info' ? 2 : currentLevel === 'warn' ? 1 : 0;
  return levelOrder[lvl] <= threshold;
};

export const logger = {
  error: (...args: any[]) => {
    if (enabled('error')) console.error('[error]', ...args);
  },
  warn: (...args: any[]) => {
    if (enabled('warn')) console.warn('[warn]', ...args);
  },
  info: (...args: any[]) => {
    if (enabled('info')) console.log('[info]', ...args);
  },
  debug: (...args: any[]) => {
    if (enabled('debug')) console.debug('[debug]', ...args);
  },
};
