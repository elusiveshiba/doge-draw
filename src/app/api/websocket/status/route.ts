import { NextResponse } from 'next/server'
import { wsManager } from '@/lib/websocket'
import { logger } from '@/lib/logger'

export async function GET() {
  try {
    logger.info('WebSocket status check requested');
    
    const status = wsManager.getStatus();
    const stats = wsManager.getStats();
    
    logger.info('WebSocket status check result', { status, stats });
    
    return NextResponse.json({
      success: true,
      data: {
        status,
        stats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('WebSocket status check failed', { error });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to get WebSocket status'
    }, { status: 500 });
  }
}