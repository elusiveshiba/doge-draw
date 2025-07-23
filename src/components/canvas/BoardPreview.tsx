'use client'

import React, { useRef, useEffect } from 'react'
import { BoardWithPixels } from '@/types'
import { getPixelKey } from '@/lib/utils'

interface BoardPreviewProps {
  board: BoardWithPixels
  maxWidth?: number
  maxHeight?: number
}

export function BoardPreview({ board, maxWidth = 120, maxHeight = 120 }: BoardPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Calculate scale to fit within max dimensions while maintaining aspect ratio
    const scale = Math.min(maxWidth / board.width, maxHeight / board.height)
    const scaledWidth = board.width * scale
    const scaledHeight = board.height * scale

    canvas.width = scaledWidth
    canvas.height = scaledHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Fill background
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, scaledWidth, scaledHeight)

    // Create pixel map for quick lookup
    const pixelMap = new Map<string, string>()
    board.pixels?.forEach((pixel: any) => {
      if (!pixel.isHidden) {
        pixelMap.set(getPixelKey(pixel.x, pixel.y), pixel.color)
      }
    })

    // Draw pixels - each pixel might be less than 1 canvas pixel at small scales
    if (scale >= 1) {
      // High detail: draw each pixel as a square
      for (let x = 0; x < board.width; x++) {
        for (let y = 0; y < board.height; y++) {
          const pixelKey = getPixelKey(x, y)
          const color = pixelMap.get(pixelKey)
          
          if (color) {
            ctx.fillStyle = color
            ctx.fillRect(x * scale, y * scale, scale, scale)
          }
        }
      }
    } else {
      // Low detail: sample pixels to canvas pixels
      const imageData = ctx.createImageData(scaledWidth, scaledHeight)
      
      for (let canvasX = 0; canvasX < scaledWidth; canvasX++) {
        for (let canvasY = 0; canvasY < scaledHeight; canvasY++) {
          // Map canvas coordinates back to board coordinates
          const boardX = Math.floor(canvasX / scale)
          const boardY = Math.floor(canvasY / scale)
          
          const pixelKey = getPixelKey(boardX, boardY)
          const color = pixelMap.get(pixelKey)
          
          const index = (canvasY * scaledWidth + canvasX) * 4
          
          if (color) {
            // Parse hex color
            const hex = color.replace('#', '')
            const r = parseInt(hex.substr(0, 2), 16)
            const g = parseInt(hex.substr(2, 2), 16)
            const b = parseInt(hex.substr(4, 2), 16)
            
            imageData.data[index] = r
            imageData.data[index + 1] = g
            imageData.data[index + 2] = b
            imageData.data[index + 3] = 255
          } else {
            // White background
            imageData.data[index] = 255
            imageData.data[index + 1] = 255
            imageData.data[index + 2] = 255
            imageData.data[index + 3] = 255
          }
        }
      }
      
      ctx.putImageData(imageData, 0, 0)
    }

    // Add subtle border
    ctx.strokeStyle = '#E5E7EB'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, scaledWidth, scaledHeight)

  }, [board, maxWidth, maxHeight])

  // Calculate display dimensions maintaining aspect ratio
  const aspectRatio = board.width / board.height
  let displayWidth = maxWidth
  let displayHeight = maxWidth / aspectRatio

  if (displayHeight > maxHeight) {
    displayHeight = maxHeight
    displayWidth = maxHeight * aspectRatio
  }

  return (
    <div 
      className="bg-gray-50 rounded border flex items-center justify-center"
      style={{ 
        width: '100%',
        height: `${displayHeight}px`,
        maxWidth: `${displayWidth}px`,
        margin: '0 auto'
      }}
    >
      {board.pixels && board.pixels.length > 0 ? (
        <canvas
          ref={canvasRef}
          style={{ 
            imageRendering: 'pixelated',
            width: '100%',
            height: '100%',
            objectFit: 'contain'
          }}
        />
      ) : (
        <span className="text-gray-400 text-xs">Empty Board</span>
      )}
    </div>
  )
} 