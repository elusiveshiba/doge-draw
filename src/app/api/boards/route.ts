import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/boards - List all boards (public)
export async function GET(request: NextRequest) {
  try {
    const boards = await prisma.board.findMany({
      include: {
        pixels: {
          where: { isHidden: false },
          select: { id: true } // Only fetch id for count
        },
        _count: {
          select: { pixels: true, pixelHistory: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json({ success: true, data: boards })
  } catch (error) {
    console.error('Error fetching boards:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
