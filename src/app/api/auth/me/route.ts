import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { prisma } from '@/lib/prisma'

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || 'fallback-secret')

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({
        success: false,
        error: 'No token provided'
      }, { status: 401 })
    }

    const token = authHeader.substring(7)

    // Verify JWT token
    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as string

    // Get current user data
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 })
    }

    // Check if user is admin based on environment variable
    const adminAddresses = process.env.ADMIN_WALLET_ADDRESSES?.split(',').map(addr => addr.trim()) || []
    const isAdmin = adminAddresses.includes(user.walletAddress)

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        walletAddress: user.walletAddress,
        credits: user.credits,
        isAdmin: isAdmin
      }
    })

  } catch (error) {
    console.error('Auth verification error:', error)
    return NextResponse.json({
      success: false,
      error: 'Invalid token'
    }, { status: 401 })
  }
} 