import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { z } from 'zod'
import { submitPixelReport, getPendingReports } from '@/lib/moderation'
import { prisma } from '@/lib/prisma'

const reportPixelSchema = z.object({
  pixelId: z.string().cuid(),
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

// Submit a pixel report
export async function POST(request: NextRequest) {
  try {
    const userId = await verifyAuth(request)
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    const body = await request.json()
    const { pixelId, reason } = reportPixelSchema.parse(body)

    const result = await submitPixelReport(pixelId, userId, reason)

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in report submission:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

// Get pending reports (admin only)
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

    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')

    const reports = await getPendingReports(limit)

    return NextResponse.json({ reports })
  } catch (error) {
    console.error('Error fetching pending reports:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
} 
import { jwtVerify } from 'jose'
import { z } from 'zod'
import { submitPixelReport, getPendingReports } from '@/lib/moderation'
import { prisma } from '@/lib/prisma'

const reportPixelSchema = z.object({
  pixelId: z.string().cuid(),
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

// Submit a pixel report
export async function POST(request: NextRequest) {
  try {
    const userId = await verifyAuth(request)
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    const body = await request.json()
    const { pixelId, reason } = reportPixelSchema.parse(body)

    const result = await submitPixelReport(pixelId, userId, reason)

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in report submission:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

// Get pending reports (admin only)
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

    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')

    const reports = await getPendingReports(limit)

    return NextResponse.json({ reports })
  } catch (error) {
    console.error('Error fetching pending reports:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
} 