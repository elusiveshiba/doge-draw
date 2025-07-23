import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { z } from 'zod'
import { submitPixelReport } from '@/lib/moderation'
import { prisma } from '@/lib/prisma'

const reportPixelSchema = z.object({
  boardId: z.string(),
  pixels: z.array(z.object({ x: z.number(), y: z.number() })),
  reason: z.string().min(1, 'Reason is required').max(200, 'Reason too long')
})

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || 'fallback-secret')

export async function POST(request: NextRequest) {
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

    // Parse request body
    const body = await request.json()
    const { boardId, pixels, reason } = reportPixelSchema.parse(body)

    // Look up real pixel IDs for each (x, y)
    const foundPixels = await prisma.pixel.findMany({
      where: {
        boardId,
        OR: pixels.map(({ x, y }) => ({ x, y }))
      },
      select: { id: true, x: true, y: true }
    })
    // Map (x, y) to pixelId
    const pixelIdMap = new Map(foundPixels.map(p => [`${p.x},${p.y}`, p.id]))

    // Submit reports for all pixels
    let skippedCount = 0
    const results = await Promise.all(pixels.map(({ x, y }) => {
      const pixelId = pixelIdMap.get(`${x},${y}`)
      if (!pixelId) {
        skippedCount++
        return Promise.resolve({ success: null, error: null, pixelHidden: false }) // null = skipped
      }
      return submitPixelReport(pixelId, userId, reason)
    }))
    const successCount = results.filter(r => r.success === true).length
    const errorResults = results.filter(r => r.success === false)
    const errors = errorResults.map(r => r.error)
    const anyPixelHidden = results.some(r => r.pixelHidden)
    const skipped = results.filter(r => r.success === null).length

    return NextResponse.json({
      success: errorResults.length === 0,
      successCount,
      errorCount: errorResults.length,
      skippedCount: skipped,
      errors,
      anyPixelHidden
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: error.errors[0].message
      }, { status: 400 })
    }
    console.error('Report pixel error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
} 