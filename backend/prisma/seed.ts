import { PrismaClient } from '../src/generated/prisma';
import { addHours } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.$executeRaw`TRUNCATE TABLE "Pledge" CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE "Auction" CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE "User" CASCADE`;

  // Create admin user
  const admin = await prisma.user.create({
    data: {
      id: 'admin',
      ordinal_address: 'bc1pkddf9em6k82spy0ysxdqp5t5puuwdkn6prhcqvhf6vf8tcc686lq4uy0ca',
      connected: true,
      network: 'mainnet',
    },
  });

  // Create test users with sample pledges
  const testUsers = [
    {
      id: 'user-1',
      ordinal_address: 'bc1p5d7tjqlc2kd9czyx7v4d4hq9qk9y0k5j5q6jz8v7q9q6q6q6q6q6q6q6q6',
      pledgeAmount: 0.5, // BTC
      cardinal_address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    },
    {
      id: 'user-2',
      ordinal_address: 'bc1p3q6f8z4h5j7k9l0p2q5w8e9r7t6y4u3i2o1p9o8i7u6y5t4r3e2w1q0',
      pledgeAmount: 0.25, // BTC
      cardinal_address: 'bc1q9z0t9z5y7x0v9w8z2x3c4v5b6n7m8l9k0j1h2g3f4d5s6f7h8j9k0l1',
    },
    {
      id: 'user-3',
      ordinal_address: 'bc1p0o9i8u7y6t5r4e3w2q1a9s8d7f6g5h4j3k2l1z0x9c8v7b6n5m4l3k2j1',
      pledgeAmount: 0.1, // BTC
      cardinal_address: 'bc1q1a2s3d4f5g6h7j8k9l0p1o2i3u4y5t6r7e8w9q0a1s2d3f4g5h6j7k8l9',
    },
  ];

  // Create test users
  const createdUsers = await Promise.all(
    testUsers.map(async (user) => {
      return prisma.user.create({
        data: {
          id: user.id,
          ordinal_address: user.ordinal_address,
          cardinal_address: user.cardinal_address,
          connected: true,
          network: 'testnet',
        },
      });
    })
  );

  // Create a new auction that runs for 72 hours
  const now = new Date();
  const endTime = addHours(now, 72);

  const auction = await prisma.auction.create({
    data: {
      id:"3551190a-c374-4089-a4b0-35912e65ebdd",
      totalTokens: 100000000, // 100M tokens (10% of total supply)
      ceilingMarketCap: 15000000, // $15M ceiling market cap
      totalBTCPledged: 0, // Start with 0 BTC pledged
      refundedBTC: 0, // Start with 0 BTC refunded
      startTime: now,
      endTime,
      isActive: true,
      isCompleted: false,
      minPledge: 0.001, // 0.001 BTC minimum pledge
      maxPledge: 0.5,   // 0.5 BTC maximum pledge
    },
  });

  // Create sample pledges
  for (const user of testUsers) {
    await prisma.pledge.create({
      data: {
        userId: user.id,
        auctionId: auction.id,
        btcAmount: user.pledgeAmount,
        depositAddress: 'generated-deposit-address', // In a real scenario, this would be generated
        status: 'confirmed',
        verified: true,
      },
    });
  }

  // Update the auction with the total pledged amount
  const totalPledged = testUsers.reduce((sum, user) => sum + user.pledgeAmount, 0);
  await prisma.auction.update({
    where: { id: auction.id },
    data: { totalBTCPledged: totalPledged },
  });

  console.log('Database has been seeded with:');
  console.log(`- Admin user (ID: ${admin.id})`);
  console.log(`- ${createdUsers.length} test users`);
  console.log(`- 1 active auction (ID: ${auction.id})`);
  console.log(`- Total BTC pledged: ${totalPledged} BTC`);
  console.log(`- Auction will end at: ${endTime}`);
}

main()
  .catch((e) => {
    console.error(e);
    //@ts-ignore
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
