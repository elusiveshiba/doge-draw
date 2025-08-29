import { NextResponse } from 'next/server'
import { webSocketService } from '@/lib/websocketService'
import { logger } from '@/lib/logger'

export async function POST() {
  try {
    logger.info('WebSocket test broadcast requested');
    
    // Test pixel update broadcast
    await webSocketService.broadcastPixelUpdate({
      boardId: 'cmerzdgy600026zxlqyslut89',
      x: 99,
      y: 99,
      color: '#TEST00',
      newPrice: 999,
      userId: 'test-user'
    });
    
    logger.info('WebSocket test broadcast completed');
    
    return NextResponse.json({
      success: true,
      message: 'Test broadcast sent successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('WebSocket test broadcast failed', { error });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to send test broadcast'
    }, { status: 500 });
  }
}