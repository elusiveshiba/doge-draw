import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { schemas, validatePassword } from '@/lib/validation'
import { rateLimiters, getUserIdentifier } from '@/lib/rateLimit'
import { config } from '@/lib/config'
import { logger } from '@/lib/logger'
import { AuthService } from '@/lib/auth'

const registerSchema = z.object({
  walletAddress: schemas.walletAddress,
  password: schemas.password
})

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const clientIp = getUserIdentifier(request);
  
  try {
    // Apply rate limiting for registration
    const rateLimitResult = await rateLimiters.authAttempt.checkLimit(clientIp, 'register', false);
    if (!rateLimitResult.allowed) {
      logger.warn('Registration rate limit exceeded', { 
        clientIp, 
        remaining: rateLimitResult.remaining 
      });
      
      return NextResponse.json({
        success: false,
        error: 'Too many registration attempts. Please try again later.',
        retryAfter: rateLimitResult.retryAfter
      }, { 
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter || 300),
        }
      });
    }

    const body = await request.json();
    const { walletAddress, password } = registerSchema.parse(body);

    // Additional password validation
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      logger.warn('Registration failed - weak password', { 
        walletAddress: walletAddress.substring(0, 8) + '...',
        errors: passwordValidation.errors 
      });
      
      return NextResponse.json({
        success: false,
        error: passwordValidation.errors[0]
      }, { status: 400 });
    }

    logger.info('Registration attempt', { 
      walletAddress: walletAddress.substring(0, 8) + '...',
      clientIp 
    });

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { walletAddress },
      select: { id: true }
    });

    if (existingUser) {
      logger.warn('Registration failed - user exists', { walletAddress });
      // Count as failed attempt for rate limiting
      await rateLimiters.authAttempt.checkLimit(clientIp, 'register', false);
      
      return NextResponse.json({
        success: false,
        error: config.enableWalletValidation 
          ? 'User with this wallet address already exists'
          : 'Username already taken'
      }, { status: 400 });
    }

    // Hash password with increased rounds for security
    const hashedPassword = await bcrypt.hash(password, 12);

    // Check if user should be admin
    const isAdmin = AuthService.isAdmin(walletAddress);
    
    // Get starting credits from configuration
    const startingCredits = config.startingCredits;

    // Create user
    const user = await prisma.user.create({
      data: {
        walletAddress,
        passwordHash: hashedPassword,
        credits: startingCredits,
        isAdmin
      },
      select: {
        id: true,
        walletAddress: true,
        credits: true,
        isAdmin: true,
        createdAt: true
      }
    });

    logger.info('User registered successfully', { 
      userId: user.id,
      isAdmin: user.isAdmin,
      startingCredits,
      duration: Date.now() - startTime 
    });

    // Reset rate limit on successful registration
    await rateLimiters.authAttempt.resetLimit(clientIp, 'register');

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          walletAddress: user.walletAddress,
          credits: user.credits,
          isAdmin: user.isAdmin,
        }
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error instanceof z.ZodError) {
      logger.warn('Registration validation error', { 
        error: error.errors[0].message,
        clientIp,
        duration 
      });
      
      return NextResponse.json({
        success: false,
        error: error.errors[0].message
      }, { status: 400 });
    }

    // Handle Prisma unique constraint errors
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      logger.warn('Registration failed - duplicate constraint', { 
        error,
        clientIp,
        duration 
      });
      
      return NextResponse.json({
        success: false,
        error: 'User already exists'
      }, { status: 400 });
    }

    logger.error('Registration internal error', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      clientIp,
      duration 
    });
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
} 