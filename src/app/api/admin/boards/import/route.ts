import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || 'fallback-secret')

// Define validation schema for import data
const importDataSchema = z.object({
  version: z.string(),
  exportedAt: z.string(),
  exportedBy: z.object({
    id: z.string(),
    walletAddress: z.string()
  }),
  board: z.object({
    name: z.string(),
    width: z.number().int().min(10).max(1000),
    height: z.number().int().min(10).max(1000),
    startingPixelPrice: z.number().int().min(1),
    priceMultiplier: z.number().min(1.0).max(5.0),
    isActive: z.boolean(),
    isFrozen: z.boolean(),
    endDate: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string()
  }),
  pixels: z.array(z.object({
    x: z.number().int(),
    y: z.number().int(),
    color: z.string(),
    currentPrice: z.number().int(),
    timesChanged: z.number().int(),
    isHidden: z.boolean(),
    lastChangedAt: z.string(),
    lastChangedBy: z.object({
      id: z.string(),
      walletAddress: z.string()
    }).nullable()
  })),
  pixelHistory: z.array(z.object({
    x: z.number().int(),
    y: z.number().int(),
    color: z.string(),
    pricePaid: z.number().int(),
    timestamp: z.string(),
    pixelId: z.string(),
    user: z.object({
      id: z.string(),
      walletAddress: z.string()
    })
  })),
  statistics: z.object({
    totalPixels: z.number(),
    totalHistoryEntries: z.number(),
    uniqueContributors: z.number()
  })
})

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

async function findOrCreateUser(walletAddress: string) {
  // Try to find existing user by wallet address
  let user = await prisma.user.findUnique({
    where: { walletAddress }
  })
  
  if (!user) {
    // Create a placeholder user for imported data
    // They will need to register properly to access the system
    user = await prisma.user.create({
      data: {
        walletAddress,
        passwordHash: 'IMPORTED_USER_NO_ACCESS', // Special marker to prevent login
        credits: 0
      }
    })
  }
  
  return user
}

export async function POST(request: NextRequest) {
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

    const body = await request.json()
    
    // Validate import data structure
    const importData = importDataSchema.parse(body)

    // Check if version is supported
    if (importData.version !== '1.0') {
      return NextResponse.json({
        success: false,
        error: `Unsupported export version: ${importData.version}`
      }, { status: 400 })
    }

    // Start database transaction for atomic import
    const result = await prisma.$transaction(async (tx) => {
      // Create the new board
      const newBoard = await tx.board.create({
        data: {
          name: importData.board.name,
          width: importData.board.width,
          height: importData.board.height,
          startingPixelPrice: importData.board.startingPixelPrice,
          priceMultiplier: importData.board.priceMultiplier,
          isActive: importData.board.isActive,
          isFrozen: importData.board.isFrozen,
          endDate: importData.board.endDate ? new Date(importData.board.endDate) : null,
          createdAt: new Date(importData.board.createdAt),
          updatedAt: new Date(importData.board.updatedAt)
        }
      })

      // Create a mapping of old pixel IDs to new ones and coordinate-based mapping
      const pixelIdMap = new Map<string, string>()
      const coordinateToPixelId = new Map<string, string>()
      const userIdMap = new Map<string, string>()

      // Process users from pixel history first
      const uniqueUsers = new Set<string>()
      importData.pixelHistory.forEach(history => {
        uniqueUsers.add(history.user.walletAddress)
      })
      
      importData.pixels.forEach(pixel => {
        if (pixel.lastChangedBy) {
          uniqueUsers.add(pixel.lastChangedBy.walletAddress)
        }
      })

      // Find or create users
      for (const walletAddress of uniqueUsers) {
        const foundUser = await findOrCreateUser(walletAddress)
        userIdMap.set(walletAddress, foundUser.id)
      }

      // Import pixels and build coordinate mapping
      for (const pixelData of importData.pixels) {
        const lastChangedById = pixelData.lastChangedBy 
          ? userIdMap.get(pixelData.lastChangedBy.walletAddress) 
          : null

        const newPixel = await tx.pixel.create({
          data: {
            x: pixelData.x,
            y: pixelData.y,
            color: pixelData.color,
            currentPrice: pixelData.currentPrice,
            timesChanged: pixelData.timesChanged,
            isHidden: pixelData.isHidden,
            lastChangedAt: new Date(pixelData.lastChangedAt),
            boardId: newBoard.id,
            lastChangedById
          }
        })

        // Map both old ID and coordinates to new pixel ID
        pixelIdMap.set(pixelData.id, newPixel.id)
        coordinateToPixelId.set(`${pixelData.x},${pixelData.y}`, newPixel.id)
      }

      // Import pixel history with better pixel ID resolution
      for (const historyData of importData.pixelHistory) {
        const userId = userIdMap.get(historyData.user.walletAddress)

        if (!userId) {
          throw new Error(`User not found for wallet: ${historyData.user.walletAddress}`)
        }

        // Try to find pixel by old ID first, then by coordinates
        let pixelId = pixelIdMap.get(historyData.pixelId)
        if (!pixelId) {
          pixelId = coordinateToPixelId.get(`${historyData.x},${historyData.y}`)
        }

        if (!pixelId) {
          // If still not found, create a new pixel for this coordinate
          const newPixel = await tx.pixel.create({
            data: {
              x: historyData.x,
              y: historyData.y,
              color: historyData.color,
              currentPrice: 100, // Default price
              timesChanged: 0,
              isHidden: false,
              lastChangedAt: new Date(historyData.timestamp),
              boardId: newBoard.id,
              lastChangedById: userId
            }
          })
          pixelId = newPixel.id
          coordinateToPixelId.set(`${historyData.x},${historyData.y}`, pixelId)
        }

        await tx.pixelHistory.create({
          data: {
            x: historyData.x,
            y: historyData.y,
            color: historyData.color,
            pricePaid: historyData.pricePaid,
            timestamp: new Date(historyData.timestamp),
            boardId: newBoard.id,
            userId,
            pixelId
          }
        })
      }

      return {
        boardId: newBoard.id,
        pixelsImported: importData.pixels.length,
        historyImported: importData.pixelHistory.length,
        usersProcessed: uniqueUsers.size
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Board imported successfully',
      data: result
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid import data format',
        details: error.errors
      }, { status: 400 })
    }

    console.error('Error importing board:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}