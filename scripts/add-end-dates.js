const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function addEndDates() {
  console.log('Adding end dates to boards...');

  try {
    // Get all boards
    const boards = await prisma.board.findMany();

    if (boards.length === 0) {
      console.log('No boards found');
      return;
    }

    // Add end dates to boards
    for (const board of boards) {
      let endDate;
      
      if (board.name.toLowerCase().includes('practice')) {
        // Practice board ends in 7 days
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);
      } else if (board.name.toLowerCase().includes('premium')) {
        // Premium board ends in 30 days  
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
      } else {
        // Main canvas ends in 14 days
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 14);
      }

      await prisma.board.update({
        where: { id: board.id },
        data: { endDate }
      });

      console.log(`✅ Updated ${board.name} with end date: ${endDate.toLocaleString()}`);
    }

    console.log('✅ All boards updated with end dates');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addEndDates(); 

const prisma = new PrismaClient();

async function addEndDates() {
  console.log('Adding end dates to boards...');

  try {
    // Get all boards
    const boards = await prisma.board.findMany();

    if (boards.length === 0) {
      console.log('No boards found');
      return;
    }

    // Add end dates to boards
    for (const board of boards) {
      let endDate;
      
      if (board.name.toLowerCase().includes('practice')) {
        // Practice board ends in 7 days
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);
      } else if (board.name.toLowerCase().includes('premium')) {
        // Premium board ends in 30 days  
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
      } else {
        // Main canvas ends in 14 days
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 14);
      }

      await prisma.board.update({
        where: { id: board.id },
        data: { endDate }
      });

      console.log(`✅ Updated ${board.name} with end date: ${endDate.toLocaleString()}`);
    }

    console.log('✅ All boards updated with end dates');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addEndDates(); 

const prisma = new PrismaClient();

async function addEndDates() {
  console.log('Adding end dates to boards...');

  try {
    // Get all boards
    const boards = await prisma.board.findMany();

    if (boards.length === 0) {
      console.log('No boards found');
      return;
    }

    // Add end dates to boards
    for (const board of boards) {
      let endDate;
      
      if (board.name.toLowerCase().includes('practice')) {
        // Practice board ends in 7 days
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);
      } else if (board.name.toLowerCase().includes('premium')) {
        // Premium board ends in 30 days  
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
      } else {
        // Main canvas ends in 14 days
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 14);
      }

      await prisma.board.update({
        where: { id: board.id },
        data: { endDate }
      });

      console.log(`✅ Updated ${board.name} with end date: ${endDate.toLocaleString()}`);
    }

    console.log('✅ All boards updated with end dates');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addEndDates(); 

const prisma = new PrismaClient();

async function addEndDates() {
  console.log('Adding end dates to boards...');

  try {
    // Get all boards
    const boards = await prisma.board.findMany();

    if (boards.length === 0) {
      console.log('No boards found');
      return;
    }

    // Add end dates to boards
    for (const board of boards) {
      let endDate;
      
      if (board.name.toLowerCase().includes('practice')) {
        // Practice board ends in 7 days
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);
      } else if (board.name.toLowerCase().includes('premium')) {
        // Premium board ends in 30 days  
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
      } else {
        // Main canvas ends in 14 days
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 14);
      }

      await prisma.board.update({
        where: { id: board.id },
        data: { endDate }
      });

      console.log(`✅ Updated ${board.name} with end date: ${endDate.toLocaleString()}`);
    }

    console.log('✅ All boards updated with end dates');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addEndDates(); 