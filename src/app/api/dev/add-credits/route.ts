import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { prisma } from '@/lib/prisma'

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || 'fallback-secret')

export async function POST(request: NextRequest) {
  // Only allow in development mode
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({
      success: false,
      error: 'Development endpoint not available in production'
    }, { status: 403 })
  }

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

    // Add 1000 credits to the user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        credits: { increment: 1000 }
      }
    })

    // Record the transaction for tracking
    await prisma.transaction.create({
      data: {
        userId,
        type: 'CREDIT_PURCHASE',
        amount: 1000,
        status: 'COMPLETED'
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        newCredits: updatedUser.credits,
        added: 1000
      }
    })

  } catch (error) {
    console.error('Add credits error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
} 