import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { z } from 'zod'
import { resetCanvasSection } from '@/lib/moderation'

const canvasResetSchema = z.object({
  boardId: z.string().cuid(),
  fromX: z.number().int().min(0).optional(),
  fromY: z.number().int().min(0).optional(),
  toX: z.number().int().min(0).optional(),
  toY: z.number().int().min(0).optional(),
  pixels: z.array(z.object({ x: z.number().int().min(0), y: z.number().int().min(0) })).optional(),
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

// Reset a section of the canvas
export async function POST(request: NextRequest) {
  try {
    const userId = await verifyAuth(request)
    if (!userId) {
      return NextResponse.json({
        error: 'Authentication required'
      }, { status: 401 })
    }
    const body = await request.json()
    const { boardId, fromX, fromY, toX, toY, pixels, reason } = canvasResetSchema.parse(body)

    if (pixels && pixels.length > 0) {
      // Batch reset: delete all specified pixels
      // (Assume only admins/trusted users can do this)
      const { prisma } = await import('@/lib/prisma')
      const deleteResult = await prisma.pixel.deleteMany({
        where: {
          boardId,
          OR: pixels.map(({x, y}) => ({ x, y }))
        }
      })
      // Log moderation action (optional: could log all pixels or just area bounds)
      await prisma.moderationAction.create({
        data: {
          actionType: 'CANVAS_RESET',
          reason,
          moderatorId: userId,
          boardId,
          affectedPixels: deleteResult.count
        }
      })
      return NextResponse.json({ success: true, pixelsReset: deleteResult.count })
    } else {
      // Fallback to old area-based reset
      const result = await resetCanvasSection(userId, boardId, fromX!, fromY!, toX!, toY!, reason)
      if (!result.success) {
        return NextResponse.json(result, { status: 400 })
      }
      return NextResponse.json(result)
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: error.errors[0].message
      }, { status: 400 })
    }
    console.error('Error resetting canvas section:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
} 