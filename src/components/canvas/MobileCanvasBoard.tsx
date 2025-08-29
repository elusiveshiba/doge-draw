/**
 * Example integration of mobile reconnection functionality with CanvasBoard
 * This shows how to modify the existing component to use the new mobile sync features
 */

'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import { useWebSocket } from '@/hooks/useWebSocket'
import { mobileSync, MobileSync } from '@/lib/mobileSync'
import { BoardWithPixels, PixelData, WebSocketMessage } from '@/types'
import { getPixelKey } from '@/lib/utils'

interface MobileCanvasBoardProps {
  board: BoardWithPixels
  className?: string
  readonly?: boolean
}

export function MobileCanvasBoard({ board, className, readonly = false }: MobileCanvasBoardProps) {
  const { user } = useAuth()
  const [pixels, setPixels] = useState<Map<string, PixelData>>(new Map())
  const [showSyncNotification, setShowSyncNotification] = useState(false)
  
  // Client-side pixel batching system
  const pixelUpdateBufferRef = useRef<Map<string, PixelData>>(new Map())
  const animationFrameRef = useRef<number | null>(null)

  // Use the enhanced WebSocket hook with mobile sync
  const {
    socket,
    isConnected,
    isReconnecting,
    requestSync,
    updateLastUpdate,
    needsSync,
    syncState
  } = useWebSocket({
    boardId: board.id,
    userId: user?.id,
    enableMobileSync: true,
    autoReconnect: true
  })
  
  // Flush pixel buffer and update state efficiently
  const flushPixelBuffer = useCallback(() => {
    const buffer = pixelUpdateBufferRef.current
    if (buffer.size === 0) return
    
    // Batch update state with all buffered pixels
    setPixels(prev => {
      const newPixels = new Map(prev)
      for (const [key, pixel] of buffer) {
        newPixels.set(key, pixel)
      }
      return newPixels
    })
    
    // Clear buffer
    buffer.clear()
    animationFrameRef.current = null
  }, [])
  
  // Add pixel to buffer and schedule flush
  const addPixelToBuffer = useCallback((pixel: PixelData) => {
    const key = getPixelKey(pixel.x, pixel.y)
    pixelUpdateBufferRef.current.set(key, pixel)
    
    // Schedule flush if not already scheduled
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(flushPixelBuffer)
    }
  }, [flushPixelBuffer])
  
  // Process batch pixel updates
  const processBatchPixelUpdate = useCallback((updates: any[]) => {
    updates.forEach(update => {
      const { x, y, color, newPrice } = update
      addPixelToBuffer({
        x, y, color,
        price: newPrice,
        timesChanged: (pixels.get(getPixelKey(x, y))?.timesChanged || 0) + 1
      })
    })
  }, [addPixelToBuffer, pixels])

  // Initialize pixels from board data
  useEffect(() => {
    const initialPixels = new Map<string, PixelData>()
    
    board.pixels.forEach((pixel) => {
      initialPixels.set(getPixelKey(pixel.x, pixel.y), {
        ...pixel,
        color: pixel.color,
        price: pixel.currentPrice
      })
    })

    setPixels(initialPixels)
    
    // Update mobile sync timestamp with board data
    if (board.updatedAt) {
      mobileSync.updateBoardTimestamp(new Date(board.updatedAt).getTime())
    }
  }, [board])

  // Set up WebSocket event listeners
  useEffect(() => {
    if (!socket) return

    // Handle regular pixel updates
    const handlePixelUpdate = (data: WebSocketMessage) => {
      console.log('🎨 Received pixel update:', data)
      
      if (data.type === 'PIXEL_UPDATE') {
        const { boardId, x, y, color, newPrice } = data.payload
        
        if (String(boardId) !== String(board.id)) return
        
        // Use buffered update instead of immediate state update
        addPixelToBuffer({
          x,
          y,
          color,
          price: newPrice,
          timesChanged: (pixels.get(getPixelKey(x, y))?.timesChanged || 0) + 1
        })
        
        updateLastUpdate()
      }
    }

    // Handle board refresh (full state sync)
    const handleBoardRefresh = (data: WebSocketMessage) => {
      console.log('🔄 Received board refresh:', data)
      
      if (data.type === 'BOARD_REFRESH') {
        const { pixels: newPixels, reason } = data.payload
        
        if (reason === 'stale_connection' || reason === 'client_requested') {
          setShowSyncNotification(true)
          setTimeout(() => setShowSyncNotification(false), 3000)
        }
        
        const pixelMap = new Map<string, PixelData>()
        newPixels.forEach((pixel: any) => {
          pixelMap.set(getPixelKey(pixel.x, pixel.y), {
            x: pixel.x,
            y: pixel.y,
            color: pixel.color,
            price: pixel.price,
            timesChanged: pixel.timesChanged
          })
        })
        
        setPixels(pixelMap)
        updateLastUpdate()
      }
    }

    // Handle incremental updates
    const handlePixelUpdates = (data: WebSocketMessage) => {
      console.log('📦 Received incremental pixel updates:', data)
      
      if (data.type === 'PIXEL_UPDATES') {
        const { updates } = data.payload
        
        setPixels(prev => {
          const newPixels = new Map(prev)
          
          updates.forEach((update: any) => {
            const key = getPixelKey(update.x, update.y)
            newPixels.set(key, {
              x: update.x,
              y: update.y,
              color: update.color,
              price: update.price,
              timesChanged: update.timesChanged
            })
          })
          
          return newPixels
        })
        
        updateLastUpdate()
        setShowSyncNotification(true)
        setTimeout(() => setShowSyncNotification(false), 2000)
      }
    }

    // Handle batch pixel updates from server
    const handlePixelBatchUpdate = (data: WebSocketMessage) => {
      console.log('📦 Received pixel batch update:', data)
      
      if (data.type === 'PIXEL_BATCH_UPDATE') {
        const { boardId, updates } = data.payload
        
        if (String(boardId) !== String(board.id)) return
        
        // Process all pixels in the batch
        processBatchPixelUpdate(updates)
        updateLastUpdate()
      }
    }

    socket.on('pixel-update', handlePixelUpdate)
    socket.on('board-refresh', handleBoardRefresh)
    socket.on('pixel-updates', handlePixelUpdates)
    socket.on('pixel-batch-update', handlePixelBatchUpdate)

    return () => {
      socket.off('pixel-update', handlePixelUpdate)
      socket.off('board-refresh', handleBoardRefresh) 
      socket.off('pixel-updates', handlePixelUpdates)
      socket.off('pixel-batch-update', handlePixelBatchUpdate)
      // Clean up animation frame if pending
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [socket, board.id, updateLastUpdate])

  // Auto-sync detection
  useEffect(() => {
    if (needsSync && isConnected) {
      console.log('🔄 Auto-requesting sync due to stale state')
      requestSync()
    }
  }, [needsSync, isConnected, requestSync])

  // Show sync notification based on mobile state
  const shouldShowNotification = showSyncNotification || 
    (syncState?.hasStaleConnection && isConnected)

  return (
    <div className={className}>
      {/* Connection status indicator */}
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-3 h-3 rounded-full ${
          isConnected ? 'bg-green-500' : isReconnecting ? 'bg-yellow-500' : 'bg-red-500'
        }`} />
        <span className="text-sm text-gray-600">
          {isConnected ? 'Connected' : isReconnecting ? 'Reconnecting...' : 'Disconnected'}
        </span>
        
        {/* Mobile sync notification */}
        {shouldShowNotification && (
          <div className="ml-auto bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
            🔄 Syncing updates...
          </div>
        )}
        
        {/* Manual sync button for debugging */}
        {process.env.NODE_ENV === 'development' && (
          <button 
            onClick={requestSync}
            className="ml-2 px-2 py-1 bg-gray-200 rounded text-xs"
          >
            Force Sync
          </button>
        )}
      </div>

      {/* Mobile-specific info for development */}
      {process.env.NODE_ENV === 'development' && MobileSync.isMobile() && (
        <div className="mb-4 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
          <div>📱 Mobile detected</div>
          <div>Background: {syncState?.isInBackground ? 'Yes' : 'No'}</div>
          <div>Needs sync: {needsSync ? 'Yes' : 'No'}</div>
          <div>Last update: {new Date(syncState?.lastBoardUpdateTimestamp || 0).toLocaleTimeString()}</div>
        </div>
      )}

      {/* Canvas would go here - using existing CanvasBoard logic */}
      <div className="border border-gray-300 rounded">
        <p>Canvas rendering with {pixels.size} pixels</p>
        {/* TODO: Integrate existing canvas rendering from CanvasBoard.tsx */}
      </div>
    </div>
  )
}