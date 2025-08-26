import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const updateBoardSchema = z.object({
  isActive: z.boolean().optional(),
  isFrozen: z.boolean().optional()
})

const fullUpdateBoardSchema = z.object({
  name: z.string().min(1).max(100),
  width: z.number().int().min(10).max(1000),
  height: z.number().int().min(10).max(1000),
  startingPixelPrice: z.number().int().min(1).max(10000),
  priceMultiplier: z.number().min(1.0).max(5.0),
  isActive: z.boolean(),
  endDate: z.string().datetime().nullable().optional()
})

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || 'fallback-secret')

async function verifyAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  try {
    const token = authHeader.substring(7)
    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as string

    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    return user
  } catch {
    return null
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: boardId } = await params
    
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        pixels: {
          where: { isHidden: false },
          include: {
            lastChangedBy: {
              select: {
                walletAddress: true
              }
            }
          }
        },
        _count: {
          select: {
            pixels: true,
            pixelHistory: true
          }
        }
      }
    })

    if (!board) {
      return NextResponse.json({
        success: false,
        error: 'Board not found'
      }, { status: 404 })
    }

    // Check if user can access this board
    const user = await verifyAuth(request)
    
    // Check if user is admin based on environment variable
    const adminAddresses = process.env.ADMIN_WALLET_ADDRESSES?.split(',').map(addr => addr.trim()) || []
    const isAdmin = user ? adminAddresses.includes(user.walletAddress) : false
    
    if (!board.isActive && !isAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Board not available'
      }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      data: board
    })

  } catch (error) {
    console.error('Error fetching board:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(request)
    
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    // Check if user is admin based on environment variable
    const adminAddresses2 = process.env.ADMIN_WALLET_ADDRESSES?.split(',').map(addr => addr.trim()) || []
    const isAdmin2 = adminAddresses2.includes(user.walletAddress)

    if (!isAdmin2) {
      return NextResponse.json({
        success: false,
        error: 'Admin access required'
      }, { status: 403 })
    }

    const { id: boardId } = await params
    const body = await request.json()
    const updates = updateBoardSchema.parse(body)

    const board = await prisma.board.findUnique({
      where: { id: boardId }
    })

    if (!board) {
      return NextResponse.json({
        success: false,
        error: 'Board not found'
      }, { status: 404 })
    }

    const updatedBoard = await prisma.board.update({
      where: { id: boardId },
      data: updates
    })

    // TODO: Broadcast board status change via WebSocket
    // broadcastBoardStatus(boardId, updatedBoard)

    return NextResponse.json({
      success: true,
      data: updatedBoard
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: error.errors[0].message
      }, { status: 400 })
    }

    console.error('Error updating board:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(request)
    
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    // Check if user is admin based on environment variable
    const adminAddresses = process.env.ADMIN_WALLET_ADDRESSES?.split(',').map(addr => addr.trim()) || []
    const isAdmin = adminAddresses.includes(user.walletAddress)

    if (!isAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Admin access required'
      }, { status: 403 })
    }

    const { id: boardId } = await params

    const board = await prisma.board.findUnique({
      where: { id: boardId }
    })

    if (!board) {
      return NextResponse.json({
        success: false,
        error: 'Board not found'
      }, { status: 404 })
    }

    // Delete all related data first
    await prisma.$transaction(async (tx) => {
      // Delete pixel history
      await tx.pixelHistory.deleteMany({
        where: { boardId }
      })
      
      // Delete pixels
      await tx.pixel.deleteMany({
        where: { boardId }
      })
      
      // Delete the board
      await tx.board.delete({
        where: { id: boardId }
      })
    })

    return NextResponse.json({
      success: true,
      message: 'Board deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting board:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAuth(request)
    
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    // Check if user is admin based on environment variable
    const adminAddresses = process.env.ADMIN_WALLET_ADDRESSES?.split(',').map(addr => addr.trim()) || []
    const isAdmin = adminAddresses.includes(user.walletAddress)

    if (!isAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Admin access required'
      }, { status: 403 })
    }

    const { id: boardId } = await params
    const body = await request.json()
    const updates = fullUpdateBoardSchema.parse(body)

    const board = await prisma.board.findUnique({
      where: { id: boardId }
    })

    if (!board) {
      return NextResponse.json({
        success: false,
        error: 'Board not found'
      }, { status: 404 })
    }

    const updatedBoard = await prisma.board.update({
      where: { id: boardId },
      data: {
        name: updates.name,
        width: updates.width,
        height: updates.height,
        startingPixelPrice: updates.startingPixelPrice,
        priceMultiplier: updates.priceMultiplier,
        isActive: updates.isActive,
        endDate: updates.endDate ? new Date(updates.endDate) : null
      },
      include: {
        pixels: {
          where: { isHidden: false }
        },
        _count: {
          select: {
            pixels: true,
            pixelHistory: true
          }
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: updatedBoard
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: error.errors[0].message
      }, { status: 400 })
    }

    console.error('Error updating board:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}