import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { z } from 'zod'
import { 
  promoteUserToTrusted, 
  removeTrustedStatus, 
  autoPromoteEligibleUsers,
  checkTrustedUserEligibility 
} from '@/lib/moderation'
import { prisma } from '@/lib/prisma'

const promoteUserSchema = z.object({
  userId: z.string().cuid(),
  reason: z.string().min(1, 'Reason is required').max(200, 'Reason too long')
})

const demoteUserSchema = z.object({
  userId: z.string().cuid(),
  reason: z.string().min(1, 'Reason is required').max(200, 'Reason too long')
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
    return payload.userId as string
  } catch {
    return null
  }
}

// Get trusted users and candidates
export async function GET(request: NextRequest) {
  try {
    const userId = await verifyAuth(request)
    if (!userId) {
      return NextResponse.json({
        error: 'Authentication required'
      }, { status: 401 })
    }

    // Check if user is admin
    const adminAddresses = process.env.ADMIN_WALLET_ADDRESSES?.split(',').map(addr => addr.trim()) || []
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true }
    })

    if (!user || !adminAddresses.includes(user.walletAddress)) {
      return NextResponse.json({
        error: 'Admin access required'
      }, { status: 403 })
    }

    // Get current trusted users
    const trustedUsers = await prisma.user.findMany({
      where: { isTrusted: true },
      select: {
        id: true,
        walletAddress: true,
        trustedAt: true,
        trustedByUser: {
          select: {
            walletAddress: true
          }
        },
        _count: {
          select: {
            moderationActions: true,
            reports: true
          }
        }
      },
      orderBy: { trustedAt: 'desc' }
    })

    // Get candidates for promotion
    const candidates = await prisma.user.findMany({
      where: {
        isTrusted: false,
        isAdmin: false
      },
      select: {
        id: true,
        walletAddress: true,
        createdAt: true,
        lastReportedAt: true,
        _count: {
          select: {
            pixelHistory: true,
            reports: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    })

    // Check eligibility for each candidate
    const candidatesWithEligibility = await Promise.all(
      candidates.map(async (candidate) => ({
        ...candidate,
        eligible: await checkTrustedUserEligibility(candidate.id)
      }))
    )

    return NextResponse.json({
      trustedUsers,
      candidates: candidatesWithEligibility
    })
  } catch (error) {
    console.error('Error fetching trusted users:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}

// Promote user to trusted status
export async function POST(request: NextRequest) {
  try {
    const userId = await verifyAuth(request)
    if (!userId) {
      return NextResponse.json({
        error: 'Authentication required'
      }, { status: 401 })
    }

    // Check if user is admin
    const adminAddresses = process.env.ADMIN_WALLET_ADDRESSES?.split(',').map(addr => addr.trim()) || []
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true }
    })

    if (!user || !adminAddresses.includes(user.walletAddress)) {
      return NextResponse.json({
        error: 'Admin access required'
      }, { status: 403 })
    }

    const body = await request.json()
    const { userId: targetUserId, reason } = promoteUserSchema.parse(body)

    await promoteUserToTrusted(targetUserId, userId, reason)

    return NextResponse.json({
      success: true,
      message: 'User promoted to trusted status'
    })
  } catch (error) {
    console.error('Error promoting user:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}

// Remove trusted status
export async function DELETE(request: NextRequest) {
  try {
    const userId = await verifyAuth(request)
    if (!userId) {
      return NextResponse.json({
        error: 'Authentication required'
      }, { status: 401 })
    }

    // Check if user is admin
    const adminAddresses = process.env.ADMIN_WALLET_ADDRESSES?.split(',').map(addr => addr.trim()) || []
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true }
    })

    if (!user || !adminAddresses.includes(user.walletAddress)) {
      return NextResponse.json({
        error: 'Admin access required'
      }, { status: 403 })
    }

    const body = await request.json()
    const { userId: targetUserId, reason } = demoteUserSchema.parse(body)

    await removeTrustedStatus(targetUserId, userId, reason)

    return NextResponse.json({
      success: true,
      message: 'Trusted status removed'
    })
  } catch (error) {
    console.error('Error removing trusted status:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
} 