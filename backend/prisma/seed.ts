// Seed script: dual-mode
// - test mode (default): totalTokens=100,000 (total supply), tokensOnSale=10,000; start=now; duration=24h; ceiling=$5,000; min/max pledge = 10,000–200,000 sats; no mocked users/pledges.
// - prod mode (SEED_MODE=prod): totalTokens=1,000,000,000 (total supply), tokensOnSale=100,000,000; start=29 Aug 13:00 UTC (current year); duration=72h; ceiling=$15,000,000; creates only admin.
import { PrismaClient } from '../src/generated/prisma';
import { addHours } from 'date-fns';

const prisma = new PrismaClient();



async function main() {
  const mode = (process.env.SEED_MODE ?? 'test').toLowerCase();
  const isProd = mode === 'prod';

  // Clear existing data
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Pledge" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Auction" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');

  // Create admin user
  const admin = await prisma.user.create({
    data: {
      id: 'admin',
      ordinal_address: 'bc1pkddf9em6k82spy0ysxdqp5t5puuwdkn6prhcqvhf6vf8tcc686lq4uy0ca',
      connected: true,
      network: 'mainnet',
    },
  });

  // No mocked users are created beyond the admin; no seeded pledges.

  // Auction times
  // prod: fixed start 29 August 13:00 UTC, 72h duration
  // test: start now, 24h duration
  const currentYear = new Date().getUTCFullYear();
  const prodStart = new Date(Date.UTC(currentYear, 7, 29, 13, 0, 0)); // Aug=7 (0-based), 13:00 UTC
  const startTime = isProd ? prodStart : new Date();
  const endTime = addHours(startTime, isProd ? 72 : 24);

  // Tokenomics
  const totalTokens = isProd ? 1_000_000_000 : 100_000; // total supply used for market cap
  const tokensOnSale = isProd ? 100_000_000 : 10_000; // allocation pool used for distribution

  let minPledgeSats = 100_000; // defaults for prod style
  let maxPledgeSats = 50_000_000;
  let ceilingMarketCap = 15_000_000; // $15M for prod

  // Test mode: fixed bounds suitable for low-MC testing
  // Override prod defaults only in test mode.
  if (!isProd) {
    // Test mode ceiling: $5,000 USD
    ceilingMarketCap = 5_000;
    // Fixed min/max per request
    minPledgeSats = 10_000;
    maxPledgeSats = 200_000;
  }

  const auction = await prisma.auction.create({
    data: {
      id: '3551190a-c374-4089-a4b0-35912e65ebdd',
      totalTokens,
      tokensOnSale,
      ceilingMarketCap,
      totalBTCPledged: 0,
      refundedBTC: 0,
      startTime,
      endTime,
      isActive: true,
      isCompleted: false,
      minPledgeSats,
      maxPledgeSats,
      network: 'MAINNET',
    },
  });

  // No seed pledges; totals remain zero
  await prisma.auction.update({
    where: { id: auction.id },
    data: { totalBTCPledged: 0 },
  });

  console.log('Database has been seeded with:');
  console.log(`- Mode: ${isProd ? 'prod' : 'test'}`);
  console.log(`- Admin user (ID: ${admin.id})`);
  console.log(`- Admin user only (no mocked users/pledges)`);
  console.log(`- 1 active auction (ID: ${auction.id})`);
  console.log(`- totalTokens (total supply): ${totalTokens}`);
  console.log(`- tokensOnSale (allocation pool): ${tokensOnSale}`);
  console.log(`- Total BTC pledged: 0 BTC`);
  console.log(`- Auction will end at: ${endTime.toISOString()}`);
}

main()
  .catch((e) => {
    console.error(e);
    // @ts-ignore
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
