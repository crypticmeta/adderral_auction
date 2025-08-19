// File: backend/src/tests/setup/testcontainers.teardown.ts | Purpose: Global teardown to stop Postgres and Redis containers
export default async function globalTeardown() {
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
