import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database initialization...');

  // Create admin users if specified
  const adminAddresses = process.env.ADMIN_WALLET_ADDRESSES?.split(',').map(addr => addr.trim()) || []
  
  if (adminAddresses.length > 0) {
    for (const adminAddress of adminAddresses) {
      const existingAdmin = await prisma.user.findUnique({
        where: { walletAddress: adminAddress }
      });

      if (!existingAdmin) {
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
        const hashedPassword = await bcrypt.hash(adminPassword, 12);

        const admin = await prisma.user.create({
          data: {
            walletAddress: adminAddress,
            passwordHash: hashedPassword,
            credits: 100000, // Give admin plenty of credits
            isAdmin: true
          }
        });

        console.log(`✅ Created admin user: ${admin.walletAddress}`);
        console.log(`🔑 Admin password: ${adminPassword}`);
      } else {
        console.log(`Admin user already exists: ${existingAdmin.walletAddress}`);
      }
    }
  }

  // Set default starting credits in Settings if not present
  const existingStartingCredits = await prisma.settings.findUnique({ where: { key: 'startingCredits' } });
  if (!existingStartingCredits) {
    await prisma.settings.create({
      data: { key: 'startingCredits', value: '1000' }
    });
    console.log('✅ Set default starting credits in Settings table');
  }

  // Create sample boards
  const sampleBoards = [
    {
      name: 'Main Canvas',
      width: 100,
      height: 100,
      startingPixelPrice: 100,
      priceMultiplier: 1.2,
      isActive: true,
      isFrozen: false
    },
    {
      name: 'Small Practice Board',
      width: 50,
      height: 50,
      startingPixelPrice: 50,
      priceMultiplier: 1.1,
      isActive: true,
      isFrozen: false
    },
    {
      name: 'Premium Canvas',
      width: 200,
      height: 150,
      startingPixelPrice: 500,
      priceMultiplier: 1.5,
      isActive: true,
      isFrozen: false
    }
  ];

  for (const boardData of sampleBoards) {
    const existing = await prisma.board.findFirst({
      where: { name: boardData.name }
    });

    if (!existing) {
      const board = await prisma.board.create({
        data: boardData
      });
      console.log(`✅ Created board: ${board.name} (${board.width}x${board.height})`);
    } else {
              console.log(`Board already exists: ${existing.name}`);
    }
  }

  console.log('🎉 Database initialization completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error initializing database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 