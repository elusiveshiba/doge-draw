import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/boards - List all boards (public)
export async function GET(request: NextRequest) {
  try {
    const boards = await prisma.board.findMany({
      include: {
        pixels: {
          where: { isHidden: false },
          select: { x: true, y: true, color: true, isHidden: true }
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

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }
    const token = authHeader.substring(7)
    const { payload } = await import('jose').then(m => m.jwtVerify(token, new TextEncoder().encode(process.env.NEXTAUTH_SECRET || 'fallback-secret')))
    const userId = payload.userId as string
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 401 })
    }
    // Check admin
    const adminAddresses = process.env.ADMIN_WALLET_ADDRESSES?.split(',').map(addr => addr.trim()) || []
    if (!adminAddresses.includes(user.walletAddress)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    }
    // Create board
    const body = await request.json()
    const board = await prisma.board.create({ data: body })
    return NextResponse.json({ success: true, data: board })
  } catch (error) {
    console.error('Error creating board:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
