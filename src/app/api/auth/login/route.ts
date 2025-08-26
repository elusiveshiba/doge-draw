import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { AuthService, AuthError } from '@/lib/auth'
import { schemas } from '@/lib/validation'
import { rateLimiters, getUserIdentifier } from '@/lib/rateLimit'
import { config } from '@/lib/config'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const loginSchema = z.object({
  walletAddress: schemas.walletAddress,
  password: z.string().min(1, 'Password is required').max(1000, 'Password too long')
})

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const clientIp = getUserIdentifier(request);
  
  try {
    // Apply rate limiting
    const rateLimitResult = await rateLimiters.authAttempt.checkLimit(clientIp, 'login', false);
    if (!rateLimitResult.allowed) {
      logger.warn('Login rate limit exceeded', { 
        clientIp, 
        remaining: rateLimitResult.remaining,
        resetTime: rateLimitResult.resetTime 
      });
      
      return NextResponse.json({
        success: false,
        error: 'Too many login attempts. Please try again later.',
        retryAfter: rateLimitResult.retryAfter
      }, { 
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter || 300),
          'X-RateLimit-Limit': String(rateLimiters.authAttempt['config'].maxRequests),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
        }
      });
    }

    const body = await request.json();
    const { walletAddress, password } = loginSchema.parse(body);

    logger.info('Login attempt', { 
      walletAddress: walletAddress.substring(0, 8) + '...', // Partial address for logging
      clientIp 
    });

    // Find user by wallet address
    const user = await prisma.user.findUnique({
      where: { walletAddress },
      select: {
        id: true,
        walletAddress: true,
        passwordHash: true,
        credits: true,
        isAdmin: true,
        isTrusted: true,
        createdAt: true,
      }
    });

    if (!user) {
      logger.warn('Login failed - user not found', { walletAddress });
      // Count this as a failed attempt for rate limiting
      await rateLimiters.authAttempt.checkLimit(clientIp, 'login', false);
      
      return NextResponse.json({
        success: false,
        error: 'Invalid credentials'
      }, { status: 401 });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      logger.warn('Login failed - invalid password', { 
        userId: user.id,
        walletAddress 
      });
      // Count this as a failed attempt for rate limiting
      await rateLimiters.authAttempt.checkLimit(clientIp, 'login', false);
      
      return NextResponse.json({
        success: false,
        error: 'Invalid credentials'
      }, { status: 401 });
    }

    // Generate JWT token with enhanced payload
    const token = await AuthService.generateToken({
      userId: user.id,
      walletAddress: user.walletAddress,
      isAdmin: user.isAdmin || AuthService.isAdmin(user.walletAddress)
    });

    const responseData = {
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        credits: user.credits,
        isAdmin: user.isAdmin || AuthService.isAdmin(user.walletAddress),
        isTrusted: user.isTrusted,
      },
      token
    };

    logger.info('Login successful', { 
      userId: user.id,
      isAdmin: responseData.user.isAdmin,
      duration: Date.now() - startTime 
    });

    // Reset rate limit on successful login
    await rateLimiters.authAttempt.resetLimit(clientIp, 'login');

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error instanceof z.ZodError) {
      logger.warn('Login validation error', { 
        error: error.errors[0].message,
        clientIp,
        duration 
      });
      
      return NextResponse.json({
        success: false,
        error: error.errors[0].message
      }, { status: 400 });
    }

    if (error instanceof AuthError) {
      logger.error('Login auth error', { 
        error: error.message,
        code: error.code,
        clientIp,
        duration 
      });
      
      return NextResponse.json({
        success: false,
        error: 'Authentication failed'
      }, { status: 401 });
    }

    logger.error('Login internal error', { 
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