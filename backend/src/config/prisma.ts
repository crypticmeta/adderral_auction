/**
 * Prisma client singleton
 * Ensures a single PrismaClient instance across the backend to avoid pool exhaustion
 */

import { PrismaClient } from '../generated/prisma';

// In dev, use global to avoid creating new instances on hot-reload
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
