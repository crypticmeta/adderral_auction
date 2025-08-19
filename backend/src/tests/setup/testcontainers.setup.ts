// File: backend/src/tests/setup/testcontainers.setup.ts | Purpose: Global setup to start Postgres and Redis via Testcontainers and prepare Prisma schema
import { StartedTestContainer, GenericContainer, Wait } from 'testcontainers';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const exec = promisify(execCb);

let postgres: StartedTestContainer | null = null;
let redis: StartedTestContainer | null = null;

export default async function globalSetup() {
  // Increase verbosity for Testcontainers
  process.env.DEBUG = process.env.DEBUG ? `${process.env.DEBUG},testcontainers*` : 'testcontainers*';
  console.log('[setup] Starting global setup for Testcontainers...');
  // Start Postgres
  console.log('[setup] Starting Postgres container (postgres:16)...');
  const pgContainer = await new GenericContainer('postgres:16')
    .withEnvironment({
      POSTGRES_DB: 'testdb',
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
    .start();
  postgres = pgContainer;
  console.log('[setup] Postgres started.');

  const pgHost = pgContainer.getHost();
  const pgPort = pgContainer.getMappedPort(5432);
  const pgUser = 'test';
  const pgPass = 'test';
  const pgDb = 'testdb';

  // Start Redis
  console.log('[setup] Starting Redis container (redis:7-alpine)...');
  const redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();
  redis = redisContainer;
  console.log('[setup] Redis started.');

  const redisHost = redisContainer.getHost();
  const redisPort = redisContainer.getMappedPort(6379);

  // Set env for tests and application code
  console.log('[setup] Setting environment variables for DATABASE_URL and REDIS...');
  const databaseUrl = `postgresql://${pgUser}:${pgPass}@${pgHost}:${pgPort}/${pgDb}?schema=public`;
  process.env.DATABASE_URL = databaseUrl;
  process.env.POSTGRES_HOST = pgHost;
  process.env.POSTGRES_PORT = String(pgPort);
  process.env.POSTGRES_USER = pgUser;
  process.env.POSTGRES_PASSWORD = pgPass;
  process.env.POSTGRES_DB = pgDb;

  process.env.REDIS_HOST = redisHost;
  process.env.REDIS_PORT = String(redisPort);
  process.env.REDIS_URL = `redis://${redisHost}:${redisPort}`;

  // Generate Prisma client targeting backend/src/generated/prisma
  const cwd = path.resolve(__dirname, '../../..'); // backend/
  console.log('[setup] Using CWD for prisma commands:', cwd);
  console.log('[setup] Running prisma generate...');
  try {
    const gen = await exec('yarn prisma:generate', { cwd });
    if (gen.stdout) console.log('[setup] prisma generate stdout:', gen.stdout);
    if (gen.stderr) console.log('[setup] prisma generate stderr:', gen.stderr);
  } catch (e: any) {
    console.error('[setup] prisma generate failed:', e?.stderr || e);
    throw e;
  }

  // Apply migrations to the test DB
  console.log('[setup] Running prisma migrate deploy...');
  try {
    const mig = await exec('yarn prisma migrate deploy', { cwd, env: { ...process.env, DATABASE_URL: databaseUrl } });
    if (mig.stdout) console.log('[setup] prisma migrate deploy stdout:', mig.stdout);
    if (mig.stderr) console.log('[setup] prisma migrate deploy stderr:', mig.stderr);
  } catch (e: any) {
    console.error('[setup] prisma migrate deploy failed:', e?.stderr || e);
    throw e;
  }

  // Persist container inspection info for teardown
  ;(global as any).__TESTCONTAINERS__ = { postgres, redis };
  console.log('[setup] Global setup complete.');
}
