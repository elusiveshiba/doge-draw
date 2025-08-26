import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma, dbUtils } from '@/lib/prisma'
import { AuthService, AuthError } from '@/lib/auth'
import { schemas, isValidHexColorEnhanced, validateBoardDimensions } from '@/lib/validation'
import { rateLimiters } from '@/lib/rateLimit'
import { webSocketService } from '@/lib/websocketService'
import { logger } from '@/lib/logger'
import { calculateNewPixelPrice } from '@/lib/utils'

const paintPixelSchema = z.object({
  boardId: schemas.boardId,
  x: z.number().int().min(0).max(2000),
  y: z.number().int().min(0).max(2000),
  color: schemas.hexColor
})

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Authenticate user
    const payload = await AuthService.authenticateRequest(request);
    const userId = payload.userId;

    // Apply rate limiting
    const rateLimitResult = await rateLimiters.pixelPaint.checkLimit(userId, 'paint');
    if (!rateLimitResult.allowed) {
      logger.warn('Pixel paint rate limit exceeded', { 
        userId, 
        remaining: rateLimitResult.remaining 
      });
      
      return NextResponse.json({
        success: false,
        error: 'Rate limit exceeded. Please slow down your painting.',
        retryAfter: rateLimitResult.retryAfter
      }, { 
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter || 60),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
        }
      });
    }

    // Parse and validate request body
    const body = await request.json();
    const { boardId, x, y, color } = paintPixelSchema.parse(body);

    // Additional color validation
    if (!isValidHexColorEnhanced(color)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid color format'
      }, { status: 400 });
    }

    logger.info('Pixel paint attempt', { userId, boardId, x, y, color });

    // Use retry logic for database operations
    const result = await dbUtils.withRetry(async () => {
      return await prisma.$transaction(async (tx) => {
        // Get board and validate
        const board = await tx.board.findUnique({
          where: { id: boardId },
          select: {
            id: true,
            width: true,
            height: true,
            startingPixelPrice: true,
            priceMultiplier: true,
            isActive: true,
            isFrozen: true,
            endDate: true
          }
        });

        if (!board) {
          throw new Error('Board not found');
        }

        if (!board.isActive || board.isFrozen) {
          throw new Error('Board is not available for painting');
        }

        // Check if board has ended
        if (board.endDate && new Date() > board.endDate) {
          throw new Error('Board has ended');
        }

        // Validate coordinates
        if (!validateBoardDimensions(board.width, board.height) || 
            x < 0 || x >= board.width || y < 0 || y >= board.height) {
          throw new Error('Coordinates out of bounds');
        }

        // Get user with credits
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { 
            id: true, 
            credits: true, 
            walletAddress: true 
          }
        });

        if (!user) {
          throw new Error('User not found');
        }

        // Get existing pixel
        const existingPixel = await tx.pixel.findUnique({
          where: {
            boardId_x_y: { boardId, x, y }
          },
          select: {
            id: true,
            currentPrice: true,
            color: true,
            timesChanged: true
          }
        });

        const currentPrice = existingPixel?.currentPrice || board.startingPixelPrice;

        // Check if user has enough credits
        if (user.credits < currentPrice) {
          throw new Error(`Insufficient credits. Need ${currentPrice} credits, have ${user.credits}.`);
        }

        // Skip if same color (optimization)
        if (existingPixel?.color === color) {
          logger.debug('Skipping paint - same color', { userId, boardId, x, y, color });
          return {
            pixel: existingPixel,
            newUserCredits: user.credits,
            pricePaid: 0,
            newPrice: currentPrice,
            skipped: true
          };
        }

        // Calculate new price
        const newPrice = calculateNewPixelPrice(currentPrice, board.priceMultiplier);

        // Update or create pixel
        const updatedPixel = await tx.pixel.upsert({
          where: {
            boardId_x_y: { boardId, x, y }
          },
          update: {
            color,
            currentPrice: newPrice,
            timesChanged: { increment: 1 },
            lastChangedAt: new Date(),
            lastChangedById: userId,
            isHidden: false
          },
          create: {
            boardId,
            x,
            y,
            color,
            currentPrice: newPrice,
            timesChanged: 1,
            lastChangedAt: new Date(),
            lastChangedById: userId,
            isHidden: false
          },
          select: {
            id: true,
            x: true,
            y: true,
            color: true,
            currentPrice: true,
            timesChanged: true,
            lastChangedAt: true
          }
        });

        // Deduct credits from user
        await tx.user.update({
          where: { id: userId },
          data: { credits: { decrement: currentPrice } }
        });

        // Record transaction
        await tx.transaction.create({
          data: {
            userId,
            type: 'PIXEL_PAINT',
            amount: -currentPrice,
            status: 'COMPLETED'
          }
        });

        // Record pixel history
        await tx.pixelHistory.create({
          data: {
            boardId,
            x,
            y,
            color,
            pricePaid: currentPrice,
            userId,
            pixelId: updatedPixel.id
          }
        });

        return {
          pixel: updatedPixel,
          newUserCredits: user.credits - currentPrice,
          pricePaid: currentPrice,
          newPrice
        };
      });
    }, 3, 500); // 3 retries with 500ms base delay

    // Broadcast updates via WebSocket (non-blocking)
    if (!result.skipped) {
      try {
        logger.info('Broadcasting pixel update via WebSocket', { boardId, x, y, color, newPrice: result.newPrice, userId });
        
        await webSocketService.broadcastPixelUpdate({
          boardId,
          x,
          y,
          color,
          newPrice: result.newPrice,
          userId
        });

        // Also broadcast credits update
        await webSocketService.broadcastCreditsUpdate(userId, result.newUserCredits);
        
        logger.info('WebSocket broadcasts completed successfully');
      } catch (wsError) {
        logger.error('WebSocket broadcast failed', { wsError, userId, boardId, x, y });
      }
    }

    const duration = Date.now() - startTime;
    
    logger.info('Pixel painted successfully', { 
      userId, 
      boardId, 
      x, 
      y, 
      pricePaid: result.pricePaid,
      newPrice: result.newPrice,
      newCredits: result.newUserCredits,
      duration,
      skipped: result.skipped || false
    });

    return NextResponse.json({
      success: true,
      data: {
        pixel: result.pixel,
        newUserCredits: result.newUserCredits,
        pricePaid: result.pricePaid,
        newPrice: result.newPrice
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error instanceof z.ZodError) {
      logger.warn('Pixel paint validation error', { 
        error: error.errors[0].message,
        duration 
      });
      
      return NextResponse.json({
        success: false,
        error: error.errors[0].message
      }, { status: 400 });
    }

    if (error instanceof AuthError) {
      logger.warn('Pixel paint auth error', { 
        error: error.message,
        code: error.code,
        duration 
      });
      
      return NextResponse.json({
        success: false,
        error: 'Authentication failed'
      }, { status: 401 });
    }

    // Handle known business logic errors
    if (error instanceof Error) {
      const knownErrors = [
        'Board not found',
        'Board is not available for painting',
        'Board has ended',
        'Coordinates out of bounds',
        'User not found',
        'Insufficient credits'
      ];
      
      if (knownErrors.some(msg => error.message.includes(msg))) {
        logger.warn('Pixel paint business logic error', { 
          error: error.message,
          duration 
        });
        
        return NextResponse.json({
          success: false,
          error: error.message
        }, { status: 400 });
      }
    }

    logger.error('Pixel paint internal error', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      duration 
    });
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
} 