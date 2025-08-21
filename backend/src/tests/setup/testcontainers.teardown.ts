// File: backend/src/tests/setup/testcontainers.teardown.ts | Purpose: Global teardown to stop Postgres and Redis containers.
// Skips stopping when running in hybrid local mode (USE_LOCAL_SERVICES=true).
export default async function globalTeardown() {
  const useLocal = process.env.USE_LOCAL_SERVICES === 'true';
  const hasExternalUrls = !!process.env.DATABASE_URL && (!!process.env.REDIS_URL || (!!process.env.REDIS_HOST && !!process.env.REDIS_PORT));
  if (useLocal && hasExternalUrls) {
    console.log('[teardown] USE_LOCAL_SERVICES=true detected; skipping Testcontainers teardown.');
    return;
  }

  const containers = (global as any).__TESTCONTAINERS__ as { postgres: any; redis: any } | undefined;
  if (containers) {
    try {
      if (containers.postgres) await containers.postgres.stop({ timeout: 5000 });
    } catch {}
    try {
      if (containers.redis) await containers.redis.stop({ timeout: 5000 });
    } catch {}
  }
}
