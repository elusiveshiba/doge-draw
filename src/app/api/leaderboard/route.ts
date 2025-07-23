import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { LeaderboardEntry } from '@/types'

type UserWithStats = {
  id: string
  walletAddress: string
  isAdmin: boolean
  createdAt: Date
  pixelHistory: Array<{
    pricePaid: number
    timestamp: Date
  }>
  _count: {
    pixelHistory: number
    changedPixels: number
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get leaderboard data by counting pixels painted by each user
    const leaderboard: UserWithStats[] = await prisma.user.findMany({
      select: {
        id: true,
        walletAddress: true,
        isAdmin: true,
        createdAt: true,
        pixelHistory: {
          select: {
            pricePaid: true,
            timestamp: true
          }
        },
        _count: {
          select: {
            pixelHistory: true,
            changedPixels: true
          }
        }
      },
      where: {
        pixelHistory: {
          some: {} // Only include users who have painted at least one pixel
        }
      }
    })

    // Transform the data to include calculated statistics
    const leaderboardData = leaderboard
      .map((user: UserWithStats): Omit<LeaderboardEntry, 'rank'> => {
        const totalPixelsPainted = user._count.pixelHistory
        const totalCreditsSpent = user.pixelHistory.reduce(
          (sum: number, history: { pricePaid: number }) => sum + history.pricePaid, 
          0
        )
        const uniquePixelsOwned = user._count.changedPixels
        
        // Get first and last paint dates
        const paintTimes = user.pixelHistory.map((h: { timestamp: Date }) => h.timestamp).sort()
        const firstPaintAt = paintTimes[0] || null
        const lastPaintAt = paintTimes[paintTimes.length - 1] || null

        return {
          id: user.id,
          walletAddress: user.walletAddress,
          isAdmin: user.isAdmin,
          joinedAt: user.createdAt,
          totalPixelsPainted,
          totalCreditsSpent,
          uniquePixelsOwned,
          firstPaintAt,
          lastPaintAt,
          averagePixelCost: totalPixelsPainted > 0 ? Math.round(totalCreditsSpent / totalPixelsPainted) : 0
        }
      })
      .sort((a: Omit<LeaderboardEntry, 'rank'>, b: Omit<LeaderboardEntry, 'rank'>) => b.totalPixelsPainted - a.totalPixelsPainted) // Sort by pixels painted (descending)

    // Add ranking
    const rankedLeaderboard: LeaderboardEntry[] = leaderboardData.map((user: Omit<LeaderboardEntry, 'rank'>, index: number) => ({
      ...user,
      rank: index + 1
    }))

    return NextResponse.json({
      success: true,
      data: rankedLeaderboard
    })

  } catch (error) {
    console.error('Leaderboard API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch leaderboard data'
    }, { status: 500 })
  }
} 