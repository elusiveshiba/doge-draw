import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { z } from 'zod'
import { reviewReport } from '@/lib/moderation'
import { prisma } from '@/lib/prisma'

const reviewSchema = z.object({
  approved: z.boolean(),
  moderatorNotes: z.string().optional()
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

// Review a report
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const { approved, moderatorNotes } = reviewSchema.parse(body)

    const result = await reviewReport(params.id, userId, approved, moderatorNotes)

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error reviewing report:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
} 
import { jwtVerify } from 'jose'
import { z } from 'zod'
import { reviewReport } from '@/lib/moderation'
import { prisma } from '@/lib/prisma'

const reviewSchema = z.object({
  approved: z.boolean(),
  moderatorNotes: z.string().optional()
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

// Review a report
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const { approved, moderatorNotes } = reviewSchema.parse(body)

    const result = await reviewReport(params.id, userId, approved, moderatorNotes)

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error reviewing report:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
} 