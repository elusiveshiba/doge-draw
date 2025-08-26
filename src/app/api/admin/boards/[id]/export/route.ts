import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { prisma } from '@/lib/prisma'

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
    const user = await verifyAuth(request)
    
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    // Check if user is admin
    const adminAddresses = process.env.ADMIN_WALLET_ADDRESSES?.split(',').map(addr => addr.trim()) || []
    const isAdmin = adminAddresses.includes(user.walletAddress)

    if (!isAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Admin access required'
      }, { status: 403 })
    }

    const { id: boardId } = await params

    // Fetch complete board data including full history
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        pixels: {
          include: {
            lastChangedBy: {
              select: {
                id: true,
                walletAddress: true
              }
            }
          }
        },
        pixelHistory: {
          include: {
            user: {
              select: {
                id: true,
                walletAddress: true
              }
            }
          },
          orderBy: { timestamp: 'asc' }
        }
      }
    })

    if (!board) {
      return NextResponse.json({
        success: false,
        error: 'Board not found'
      }, { status: 404 })
    }

    // Create export data structure
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: {
        id: user.id,
        walletAddress: user.walletAddress
      },
      board: {
        id: board.id,
        name: board.name,
        width: board.width,
        height: board.height,
        startingPixelPrice: board.startingPixelPrice,
        priceMultiplier: board.priceMultiplier,
        isActive: board.isActive,
        isFrozen: board.isFrozen,
        endDate: board.endDate?.toISOString() || null,
        createdAt: board.createdAt.toISOString(),
        updatedAt: board.updatedAt.toISOString()
      },
      pixels: board.pixels.map(pixel => ({
        id: pixel.id,
        x: pixel.x,
        y: pixel.y,
        color: pixel.color,
        currentPrice: pixel.currentPrice,
        timesChanged: pixel.timesChanged,
        isHidden: pixel.isHidden,
        lastChangedAt: pixel.lastChangedAt.toISOString(),
        lastChangedBy: pixel.lastChangedBy ? {
          id: pixel.lastChangedBy.id,
          walletAddress: pixel.lastChangedBy.walletAddress
        } : null
      })),
      pixelHistory: board.pixelHistory.map(history => ({
        id: history.id,
        x: history.x,
        y: history.y,
        color: history.color,
        pricePaid: history.pricePaid,
        timestamp: history.timestamp.toISOString(),
        pixelId: history.pixelId,
        user: {
          id: history.user.id,
          walletAddress: history.user.walletAddress
        }
      })),
      statistics: {
        totalPixels: board.pixels.length,
        totalHistoryEntries: board.pixelHistory.length,
        uniqueContributors: new Set(board.pixelHistory.map(h => h.userId)).size
      }
    }

    // Set headers for file download
    const filename = `board_${board.name.replace(/[^a-zA-Z0-9]/g, '_')}_${boardId}_${new Date().toISOString().split('T')[0]}.json`
    
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      }
    })

  } catch (error) {
    console.error('Error exporting board:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}