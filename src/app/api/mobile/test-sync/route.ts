import { NextRequest, NextResponse } from 'next/server'
import { webSocketService } from '@/lib/websocketService'
import { BoardCache } from '@/lib/cache'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const { boardId, simulateStale = false, simulateIncremental = false } = await request.json()
    
    if (!boardId) {
      return NextResponse.json({
        success: false,
        error: 'Board ID required'
      }, { status: 400 })
    }

    logger.info('Mobile sync test requested', { 
      boardId, 
      simulateStale, 
      simulateIncremental 
    })

    if (simulateStale) {
      // Simulate a stale connection by sending full board refresh
      const boardState = await BoardCache.getOrSetBoardState(boardId)
      
      if (boardState) {
        // Broadcast full board refresh to simulate stale connection recovery
        await webSocketService.broadcastToBoard(boardId, 'board-refresh', {
          type: 'BOARD_REFRESH',
          payload: {
            ...boardState,
            reason: 'test_stale_connection',
            syncTimestamp: Date.now()
          }
        })
        
        return NextResponse.json({
          success: true,
          message: 'Simulated stale connection refresh',
          pixelCount: boardState.pixels.length
        })
      }
    }

    if (simulateIncremental) {
      // Simulate incremental updates
      const mockUpdates = [
        { x: 99, y: 99, color: '#TEST01', price: 999, timesChanged: 1, updatedAt: Date.now() },
        { x: 98, y: 98, color: '#TEST02', price: 888, timesChanged: 2, updatedAt: Date.now() }
      ]

      await webSocketService.broadcastToBoard(boardId, 'pixel-updates', {
        type: 'PIXEL_UPDATES',
        payload: {
          boardId,
          updates: mockUpdates,
          syncTimestamp: Date.now()
        }
      })
      
      return NextResponse.json({
        success: true,
        message: 'Simulated incremental updates',
        updateCount: mockUpdates.length
      })
    }

    // Default: test regular pixel update
    await webSocketService.broadcastPixelUpdate({
      boardId,
      x: 97,
      y: 97,
      color: '#MOBILE',
      newPrice: 777,
      userId: 'mobile-test'
    })
    
    return NextResponse.json({
      success: true,
      message: 'Test pixel update sent'
    })

  } catch (error) {
    logger.error('Mobile sync test failed', { error })
    
    return NextResponse.json({
      success: false,
      error: 'Failed to test mobile sync'
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Mobile sync test endpoint',
    usage: {
      'POST with simulateStale: true': 'Simulates stale connection requiring full refresh',
      'POST with simulateIncremental: true': 'Simulates incremental pixel updates', 
      'POST with boardId only': 'Sends test pixel update'
    }
  })
}