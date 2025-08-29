import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma, dbUtils } from '@/lib/prisma'
import { AuthService, AuthError } from '@/lib/auth'
import { schemas, isValidHexColorEnhanced, validateBoardDimensions } from '@/lib/validation'
import { rateLimiters } from '@/lib/rateLimit'
import { webSocketService } from '@/lib/websocketService'
import { logger } from '@/lib/logger'
import { calculateNewPixelPrice } from '@/lib/utils'

const paintBatchPixelSchema = z.object({
  boardId: schemas.boardId,
  pixels: z.array(z.object({
    x: z.number().int().min(0).max(2000),
    y: z.number().int().min(0).max(2000),
    color: schemas.hexColor
  })).min(1).max(50) // Allow up to 50 pixels in a batch
})

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Authenticate user
    const payload = await AuthService.authenticateRequest(request);
    const userId = payload.userId;

    // Apply rate limiting (more lenient for batches)
    const rateLimitResult = await rateLimiters.pixelPaint.checkLimit(userId, 'paint-batch');
    if (!rateLimitResult.allowed) {
      logger.warn('Pixel batch paint rate limit exceeded', { 
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
    const { boardId, pixels: pixelsToUpdate } = paintBatchPixelSchema.parse(body);

    // Validate all colors
    for (const pixel of pixelsToUpdate) {
      if (!isValidHexColorEnhanced(pixel.color)) {
        return NextResponse.json({
          success: false,
          error: `Invalid color format: ${pixel.color}`
        }, { status: 400 });
      }
    }

    logger.info('Pixel batch paint attempt', { userId, boardId, pixelCount: pixelsToUpdate.length });

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

        // Validate coordinates for all pixels
        for (const pixel of pixelsToUpdate) {
          if (!validateBoardDimensions(board.width, board.height) || 
              pixel.x < 0 || pixel.x >= board.width || pixel.y < 0 || pixel.y >= board.height) {
            throw new Error(`Coordinates out of bounds: (${pixel.x}, ${pixel.y})`);
          }
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

        // Get all existing pixels for cost calculation
        const existingPixelsMap = new Map();
        const existingPixels = await tx.pixel.findMany({
          where: {
            boardId,
            OR: pixelsToUpdate.map(p => ({ x: p.x, y: p.y }))
          },
          select: {
            x: true,
            y: true,
            currentPrice: true,
            color: true,
            timesChanged: true,
            id: true
          }
        });

        existingPixels.forEach(pixel => {
          existingPixelsMap.set(`${pixel.x},${pixel.y}`, pixel);
        });

        // Calculate total cost and filter out same-color pixels
        let totalCost = 0;
        const pixelsToProcess = [];
        const skippedPixels = [];

        for (const pixel of pixelsToUpdate) {
          const key = `${pixel.x},${pixel.y}`;
          const existing = existingPixelsMap.get(key);
          const currentPrice = existing?.currentPrice || board.startingPixelPrice;
          
          // Skip if same color (optimization)
          if (existing?.color === pixel.color) {
            skippedPixels.push({ ...pixel, reason: 'same_color' });
            continue;
          }

          totalCost += currentPrice;
          pixelsToProcess.push({
            ...pixel,
            currentPrice,
            existing
          });
        }

        // Check if user has enough credits for the batch
        if (user.credits < totalCost) {
          throw new Error(`Insufficient credits. Need ${totalCost} credits, have ${user.credits}.`);
        }

        if (pixelsToProcess.length === 0) {
          logger.debug('Skipping batch paint - all same colors', { userId, boardId, pixelCount: pixelsToUpdate.length });
          return {
            pixels: [],
            newUserCredits: user.credits,
            totalCost: 0,
            skipped: true,
            skippedPixels
          };
        }

        // Process all pixels in the batch
        const updatedPixels = [];
        const pixelHistories = [];
        let actualCost = 0;

        for (const pixelData of pixelsToProcess) {
          const { x, y, color, currentPrice, existing } = pixelData;
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

          updatedPixels.push(updatedPixel);
          actualCost += currentPrice;

          // Record pixel history
          pixelHistories.push({
            boardId,
            x,
            y,
            color,
            pricePaid: currentPrice,
            userId,
            pixelId: updatedPixel.id
          });
        }

        // Deduct credits from user
        if (actualCost > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { credits: { decrement: actualCost } }
          });

          // Record transaction (using existing PIXEL_PAINT type for batch)
          await tx.transaction.create({
            data: {
              userId,
              type: 'PIXEL_PAINT',
              amount: -actualCost,
              status: 'COMPLETED'
            }
          });

          // Record pixel histories
          if (pixelHistories.length > 0) {
            await tx.pixelHistory.createMany({
              data: pixelHistories
            });
          }
        }

        return {
          pixels: updatedPixels,
          newUserCredits: user.credits - actualCost,
          totalCost: actualCost,
          skippedPixels
        };
      });
    }, 3, 500); // 3 retries with 500ms base delay

    // Broadcast updates via WebSocket (non-blocking) - use batch method
    if (!result.skipped && result.pixels.length > 0) {
      try {
        logger.info('Broadcasting pixel batch update via WebSocket', { 
          boardId, 
          pixelCount: result.pixels.length,
          userId 
        });
        
        // Use the batch broadcast method directly
        const pixelUpdates = result.pixels.map(pixel => ({
          boardId,
          x: pixel.x,
          y: pixel.y,
          color: pixel.color,
          newPrice: pixel.currentPrice,
          userId
        }));
        
        await webSocketService.broadcastPixelBatch(pixelUpdates);

        // Also broadcast credits update
        await webSocketService.broadcastCreditsUpdate(userId, result.newUserCredits);
        
        logger.info('WebSocket batch broadcasts completed successfully');
      } catch (wsError) {
        logger.error('WebSocket batch broadcast failed', { wsError, userId, boardId, pixelCount: result.pixels.length });
      }
    }

    const duration = Date.now() - startTime;
    
    logger.info('Pixel batch painted successfully', { 
      userId, 
      boardId, 
      pixelCount: result.pixels.length,
      skippedCount: result.skippedPixels?.length || 0,
      totalCost: result.totalCost,
      newCredits: result.newUserCredits,
      duration,
      skipped: result.skipped || false
    });

    return NextResponse.json({
      success: true,
      data: {
        pixels: result.pixels,
        newUserCredits: result.newUserCredits,
        totalCost: result.totalCost,
        skippedPixels: result.skippedPixels || []
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error instanceof z.ZodError) {
      logger.warn('Pixel batch paint validation error', { 
        error: error.errors[0].message,
        duration 
      });
      
      return NextResponse.json({
        success: false,
        error: error.errors[0].message
      }, { status: 400 });
    }

    if (error instanceof AuthError) {
      logger.warn('Pixel batch paint auth error', { 
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
        logger.warn('Pixel batch paint business logic error', { 
          error: error.message,
          duration 
        });
        
        return NextResponse.json({
          success: false,
          error: error.message
        }, { status: 400 });
      }
    }

    logger.error('Pixel batch paint internal error', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      duration 
    });
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}