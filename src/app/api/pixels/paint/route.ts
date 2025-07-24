import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { z } from 'zod'
import { io } from 'socket.io-client'
import { prisma } from '@/lib/prisma'
import { isValidHexColor, calculateNewPixelPrice } from '@/lib/utils'

const paintPixelSchema = z.object({
  boardId: z.string().cuid(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid hex color')
})

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || 'fallback-secret')

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as string

    // Parse request body
    const body = await request.json()
    const { boardId, x, y, color } = paintPixelSchema.parse(body)

    // Validate color
    if (!isValidHexColor(color)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid color format'
      }, { status: 400 })
    }

    // Get board and validate coordinates
    const board = await prisma.board.findUnique({
      where: { id: boardId }
    })

    if (!board) {
      return NextResponse.json({
        success: false,
        error: 'Board not found'
      }, { status: 404 })
    }

    if (!board.isActive || board.isFrozen) {
      return NextResponse.json({
        success: false,
        error: 'Board is not available for painting'
      }, { status: 400 })
    }

    if (x < 0 || x >= board.width || y < 0 || y >= board.height) {
      return NextResponse.json({
        success: false,
        error: 'Coordinates out of bounds'
      }, { status: 400 })
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 })
    }

    // Get or create pixel
    let pixel = await prisma.pixel.findUnique({
      where: {
        boardId_x_y: {
          boardId,
          x,
          y
        }
      }
    })

    const currentPrice = pixel?.currentPrice || board.startingPixelPrice

    // Check if user has enough credits
    if (user.credits < currentPrice) {
      return NextResponse.json({
        success: false,
        error: `Insufficient credits. Need ${currentPrice} credits.`
      }, { status: 400 })
    }

    // Calculate new price
    const newPrice = calculateNewPixelPrice(currentPrice, board.priceMultiplier)

    // Perform transaction
    const result = await prisma.$transaction(async (tx: any) => {
      // Update or create pixel
      const updatedPixel = await tx.pixel.upsert({
        where: {
          boardId_x_y: {
            boardId,
            x,
            y
          }
        },
        update: {
          color,
          currentPrice: newPrice,
          timesChanged: { increment: 1 },
          lastChangedAt: new Date(),
          lastChangedById: userId,
          isHidden: false // Reset hidden status when painted
        },
        create: {
          boardId,
          x,
          y,
          color,
          currentPrice: newPrice,
          timesChanged: 1,
          lastChangedAt: new Date(),
          lastChangedById: userId
        }
      })

      // Deduct credits from user
      await tx.user.update({
        where: { id: userId },
        data: {
          credits: { decrement: currentPrice }
        }
      })

      // Record transaction
      await tx.transaction.create({
        data: {
          userId,
          type: 'PIXEL_PAINT',
          amount: -currentPrice,
          status: 'COMPLETED'
        }
      })

      // Record pixel history
      await tx.pixelHistory.create({
        data: {
          boardId,
          x,
          y,
          color,
          pricePaid: currentPrice,
          userId,
          pixelId: updatedPixel.id
        }
      })

      return updatedPixel
    })

    // Broadcast pixel update via WebSocket
    try {
      const wsUrl = process.env.WEBSOCKET_URL || 'http://localhost:3001'
      const wsClient = io(wsUrl, { transports: ['websocket', 'polling'] })
      wsClient.on('connect', () => {
      wsClient.emit('pixel-painted', {
        boardId,
        x,
        y,
        color,
        newPrice,
        userId
        }, () => {
          wsClient.disconnect()
        })
      })
      wsClient.on('connect_error', () => {
        wsClient.disconnect()
      })
      setTimeout(() => {
        if (wsClient.connected) {
      wsClient.disconnect()
        }
      }, 2000)
    } catch (wsError) {
      // Don't fail the request if WebSocket fails
    }

    return NextResponse.json({
      success: true,
      data: {
        pixel: result,
        newUserCredits: user.credits - currentPrice,
        pricePaid: currentPrice,
        newPrice
      }
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: error.errors[0].message
      }, { status: 400 })
    }

    console.error('Paint pixel error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
} 