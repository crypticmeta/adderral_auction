// Seed script: dual-mode
// - test mode (default): totalTokens=10,000; start=now; duration=24h; ceiling=$5,000; min/max pledge = 10,000–200,000 sats; seeds sample users and randomized pledges.
// - prod mode (SEED_MODE=prod): totalTokens=100,000,000; start=2 Sep UTC (current year); duration=72h; ceiling=$15,000,000; creates only admin (no test users/pledges).
import { PrismaClient } from '../src/generated/prisma';
import { addHours } from 'date-fns';
import axios from 'axios';

const prisma = new PrismaClient();

async function getBtcUsd(): Promise<number> {
  try {
    const { data } = await axios.get('https://api.coindesk.com/v1/bpi/currentprice/BTC.json', { timeout: 5000 });
    const price = data?.bpi?.USD?.rate_float;
    if (typeof price === 'number' && !Number.isNaN(price) && price > 0) return price;
  } catch (_e) {}
  return 50000; // fallback
}

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

  // Test users (only used in test mode)
  const testUsers = [
    {
      id: 'user-1',
      ordinal_address: 'bc1p5d7tjqlc2kd9czyx7v4d4hq9qk9y0k5j5q6jz8v7q9q6q6q6q6q6q6q6q6',
      cardinal_address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    },
    {
      id: 'user-2',
      ordinal_address: 'bc1p3q6f8z4h5j7k9l0p2q5w8e9r7t6y4u3i2o1p9o8i7u6y5t4r3e2w1q0',
      cardinal_address: 'bc1q9z0t9z5y7x0v9w8z2x3c4v5b6n7m8l9k0j1h2g3f4d5s6f7h8j9k0l1',
    },
    {
      id: 'user-3',
      ordinal_address: 'bc1p0o9i8u7y6t5r4e3w2q1a9s8d7f6g5h4j3k2l1z0x9c8v7b6n5m4l3k2j1',
      cardinal_address: 'bc1q1a2s3d4f5g6h7j8k9l0p1o2i3u4y5t6r7e8w9q0a1s2d3f4g5h6j7k8l9',
    },
  ];

  if (!isProd) {
    await Promise.all(
      testUsers.map((u) =>
        prisma.user.create({
          data: {
            id: u.id,
            ordinal_address: u.ordinal_address,
            cardinal_address: u.cardinal_address,
            connected: true,
            network: 'testnet',
          },
        })
      )
    );
  }

  // Auction times
  // prod: fixed start 2 September UTC, 72h duration
  // test: start now, 24h duration
  const currentYear = new Date().getUTCFullYear();
  const prodStart = new Date(Date.UTC(currentYear, 8, 2, 0, 0, 0)); // Sep=8 (0-based)
  const startTime = isProd ? prodStart : new Date();
  const endTime = addHours(startTime, isProd ? 72 : 24);

  // Tokens differ by mode
  const totalTokens = isProd ? 100_000_000 : 10_000;

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

  // Seed pledges
  let totalSats = 0;
  if (!isProd) {
    // Test mode: randomized amounts around ~$1000 target, clamped within bounds
    const contributorCount = Math.max(3, Math.min(6, testUsers.length));
    const chosenUsers = testUsers.slice(0, contributorCount);
    // Instead of price-derived target, center around mid of [min,max]
    const targetSats = Math.round((minPledgeSats + maxPledgeSats) / 2) * contributorCount;
    const randoms = chosenUsers.map(() => Math.random() + 0.25); // 0.25..1.25 for tighter spread
    const sumRand = randoms.reduce((a, b) => a + b, 0);
    let amounts = randoms.map((r) => Math.round((r / sumRand) * targetSats));
    amounts = amounts.map((a) => Math.min(Math.max(a, minPledgeSats), maxPledgeSats));
    let sumNow = amounts.reduce((a, b) => a + b, 0);
    const delta = targetSats - sumNow;
    if (delta !== 0 && amounts.length > 0) {
      const lastIdx = amounts.length - 1;
      const adjusted = Math.min(Math.max(amounts[lastIdx] + delta, minPledgeSats), maxPledgeSats);
      sumNow += adjusted - amounts[lastIdx];
      amounts[lastIdx] = adjusted;
    }
    totalSats = amounts.reduce((a, b) => a + b, 0);

    for (let i = 0; i < chosenUsers.length; i++) {
      const u = chosenUsers[i];
      await prisma.pledge.create({
        data: {
          userId: u.id,
          auctionId: auction.id,
          satAmount: amounts[i],
          depositAddress: 'generated-deposit-address',
          status: 'confirmed',
          verified: true,
          network: 'MAINNET',
        },
      });
    }
  }

  const totalBTCPledged = totalSats / 1e8;
  await prisma.auction.update({
    where: { id: auction.id },
    data: { totalBTCPledged },
  });

  console.log('Database has been seeded with:');
  console.log(`- Mode: ${isProd ? 'prod' : 'test'}`);
  console.log(`- Admin user (ID: ${admin.id})`);
  console.log(`- 3 test users`);
  console.log(`- 1 active auction (ID: ${auction.id})`);
  console.log(`- totalTokens: ${totalTokens}`);
  console.log(`- Total BTC pledged: ${totalBTCPledged} BTC`);
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
