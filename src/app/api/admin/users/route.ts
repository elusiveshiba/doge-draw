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

export async function GET(request: NextRequest) {
  try {
    // Get and verify user
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Check if user is admin based on environment variable
    const adminAddresses = process.env.ADMIN_WALLET_ADDRESSES?.split(',').map(addr => addr.trim()) || []
    const isAdmin = adminAddresses.includes(user.walletAddress)
    
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Fetch all users with their activity stats
    const users = await prisma.user.findMany({
      select: {
        id: true,
        walletAddress: true,
        credits: true,
        createdAt: true,
        isTrusted: true, // <-- add this line
        _count: {
          select: {
            pixelHistory: true,
            changedPixels: true,
            reports: true,
            transactions: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Add isAdmin status to each user based on environment variable
    const usersWithAdminStatus = users.map((userData: any) => ({
      ...userData,
      isAdmin: adminAddresses.includes(userData.walletAddress)
    }))

    return NextResponse.json({ users: usersWithAdminStatus })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
} 