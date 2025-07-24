import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { isValidDogeAddress } from '@/lib/utils'

const registerSchema = z.object({
  walletAddress: z.string().min(1, 'Wallet address is required'),
  password: z.string().min(6, 'Password must be at least 6 characters')
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { walletAddress, password } = registerSchema.parse(body)

    // Remove Dogecoin wallet address validation
    // if (!isValidDogeAddress(walletAddress)) {
    //   return NextResponse.json({
    //     success: false,
    //     error: 'Invalid Dogecoin wallet address'
    //   }, { status: 400 })
    // }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { walletAddress }
    })

    if (existingUser) {
      return NextResponse.json({
        success: false,
        error: 'User with this wallet address already exists'
      }, { status: 400 })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Check if user is admin
    const adminAddresses = process.env.ADMIN_WALLET_ADDRESSES?.split(',').map(addr => addr.trim()) || []
    const isAdmin = adminAddresses.includes(walletAddress)

    // Fallback: just use default starting credits if settings model is not available
    let startingCredits = 1000;
    const user = await prisma.user.create({
      data: {
        walletAddress,
        passwordHash: hashedPassword,
        credits: startingCredits,
        isAdmin
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          walletAddress: user.walletAddress,
          credits: user.credits,
          isAdmin: isAdmin // Use the calculated isAdmin value
        }
      }
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: error.errors[0].message
      }, { status: 400 })
    }

    console.error('Registration error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
} 