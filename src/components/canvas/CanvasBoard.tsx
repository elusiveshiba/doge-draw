'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { Button } from '@/components/ui/button'
import { BoardWithPixels, PixelData, WebSocketMessage } from '@/types'
import { getPixelKey, calculateNewPixelPrice, formatCredits } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'
import { ReportPixelModal } from '@/components/moderation/ReportPixelModal'
import { TrustedUserControls } from '@/components/moderation/TrustedUserControls'

interface CanvasBoardProps {
  board: BoardWithPixels
  className?: string
  readonly?: boolean
}

interface PreviewPixel {
  x: number
  y: number
  color: string
  cost: number
}

const BASE_PIXEL_SIZE = 10
// Zoom levels: specific percentages, maxing out at 1200%
// Adjusted to be more conservative to prevent overflow
const ZOOM_LEVELS = [0.1, 0.2, 0.35, 0.6, 0.85, 1.2, 1.8, 2.5, 3.5, 5, 7, 12] // 12x = 1200%

// Calculate the default zoom index based on board size
const getDefaultZoomIndex = (boardWidth: number, boardHeight: number, containerWidth: number = 1000, containerHeight: number = 750) => {
  // For a 1000-wide board, we want it to be about 2.5 times bigger than before
  // Use larger targets to allow for bigger default zoom
  const targetWidth = Math.min(containerWidth * 1.7, 2100) // Much larger: 2.1x container or 2100px max  
  const targetHeight = Math.min(containerHeight * 1.7, 1575) // Much larger: 2.1x container or 1575px max
  
  const idealZoomForWidth = targetWidth / (boardWidth * BASE_PIXEL_SIZE)
  const idealZoomForHeight = targetHeight / (boardHeight * BASE_PIXEL_SIZE)
  const idealZoom = Math.min(idealZoomForWidth, idealZoomForHeight, 2.25) // Cap at 2.25x instead of 0.9x
  
  // Find the closest zoom level that's smaller than or equal to ideal
  let bestIndex = 0 // Start from first zoom level (0.1x)
  for (let i = 0; i < ZOOM_LEVELS.length; i++) {
    if (ZOOM_LEVELS[i] <= idealZoom) {
      bestIndex = i
    } else {
      break
    }
  }
  
  return bestIndex
}

// 8 DOGECOIN themed + 8 complementary colors for balanced creativity
const PRESET_COLORS = [
  // DOGECOIN THEMED (8 colors)
  '#FFD700', // Dogecoin Gold
  '#FFA500', // Doge Orange  
  '#FFCC02', // Classic Gold
  '#FF8F00', // Deep Orange
  '#D2691E', // Chocolate Brown (Shiba fur)
  '#DEB887', // Burlywood (Light fur)
  '#F4A460', // Sandy Brown
  '#2E7D32', // Forest Green (much wow)
  
  // COMPLEMENTARY SELECTION (8 colors)
  '#000000', // Black
  '#FFFFFF', // White
  '#FF4444', // Bright Red
  '#4444FF', // Bright Blue
  '#9C27B0', // Purple
  '#607D8B', // Blue Gray
  '#795548', // Brown
  '#424242'  // Dark Gray
]

export function CanvasBoard({ board, className, readonly = false }: CanvasBoardProps) {
  const { user, refreshUser } = useAuth()
  const [pixels, setPixels] = useState<Map<string, PixelData>>(new Map())
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0])
  const [hoveredPixel, setHoveredPixel] = useState<{ x: number; y: number } | null>(null)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isCanvasReady, setIsCanvasReady] = useState(false)
  const [previewPixels, setPreviewPixels] = useState<Map<string, PreviewPixel>>(new Map())
  const [isApplying, setIsApplying] = useState(false)
  const [customColors, setCustomColors] = useState<string[]>([])
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [pickerColor, setPickerColor] = useState('#FF0000')
  const [zoomIndex, setZoomIndex] = useState(getDefaultZoomIndex(board.width, board.height))
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  // Moderation state
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportPixel, setReportPixel] = useState<{ x: number; y: number } | null>(null)
  const [rightClickedPixel, setRightClickedPixel] = useState<{ x: number; y: number } | null>(null)

  // Area selection state for admin/trusted user reset
  const [areaSelectionActive, setAreaSelectionActive] = useState(false)
  const [areaSelectionPixels, setAreaSelectionPixels] = useState<{x: number, y: number}[]>([])
  const [areaSelectionFirstPixel, setAreaSelectionFirstPixel] = useState<{x: number, y: number} | null>(null)
  const [areaSelectionHoverPixel, setAreaSelectionHoverPixel] = useState<{x: number, y: number} | null>(null)
  const areaClicksRef = useRef<{x: number, y: number}[]>([])

  // Handler to receive area selection from TrustedUserControls
  const handleAreaPixelClick = (from: {x: number, y: number}, to: {x: number, y: number}) => {
    // Set the two selected pixels for highlight
    setAreaSelectionPixels([from, to])
    setAreaSelectionFirstPixel(from)
    setAreaSelectionHoverPixel(null)
    // Do not clear highlight here; let it persist until cancel or after successful action
  }

  // Intercept canvas clicks for area selection
  const handleCanvasClick = async (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (readonly || !user) return

    const coords = getCanvasCoordinates(event)
    if (!coords) return

    if (areaSelectionActive && window.__dogeDrawAreaPixelClick) {
      // Track selected pixels for highlight
      setAreaSelectionPixels(prev => prev.length < 2 ? [...prev, coords] : prev)
      if (!areaSelectionFirstPixel) {
        setAreaSelectionFirstPixel(coords)
      }
      window.__dogeDrawAreaPixelClick(coords.x, coords.y)
      // Do NOT clear highlight after two selected; keep it until reset or cancel
      return
    }

    addToPreview(coords.x, coords.y)
  }

  // Reset area selection handler for admin/trusted user
  const [resetPixelClickHandler, setResetPixelClickHandler] = useState<((x: number, y: number) => void) | undefined>(undefined)

  // Calculate current pixel size based on zoom level
  const currentZoom = ZOOM_LEVELS[zoomIndex]
  const currentPixelSize = BASE_PIXEL_SIZE * currentZoom
  
  // Calculate display zoom percentage relative to the default zoom for this board
  const defaultZoomIndex = getDefaultZoomIndex(board.width, board.height)
  const defaultZoomLevel = ZOOM_LEVELS[defaultZoomIndex]
  const displayZoomPercentage = Math.round((currentZoom / defaultZoomLevel) * 100) + '%'

  // Load custom colors from localStorage on mount
  useEffect(() => {
    const savedColors = localStorage.getItem('doge-draw-custom-colors')
    if (savedColors) {
      try {
        setCustomColors(JSON.parse(savedColors))
      } catch (e) {
        console.error('Failed to load custom colors:', e)
      }
    }
  }, [])

  // Zoom control functions
  const zoomIn = () => {
    if (zoomIndex < ZOOM_LEVELS.length - 1) {
      setZoomIndex(zoomIndex + 1)
    }
  }

  const zoomOut = () => {
    if (zoomIndex > 0) {
      setZoomIndex(zoomIndex - 1)
    }
  }

  const resetZoom = () => {
    setZoomIndex(getDefaultZoomIndex(board.width, board.height))
  }

  // Save custom colors to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('doge-draw-custom-colors', JSON.stringify(customColors))
  }, [customColors])

  // Initialize pixels from board data
  useEffect(() => {
    const pixelMap = new Map<string, PixelData>()
    board.pixels?.forEach((pixel: any) => {
      if (!pixel.isHidden) {
        pixelMap.set(getPixelKey(pixel.x, pixel.y), {
          x: pixel.x,
          y: pixel.y,
          color: pixel.color,
          price: pixel.currentPrice,
          timesChanged: pixel.timesChanged
        })
      }
    })
    setPixels(pixelMap)
  }, [board.id])

  // Initialize Canvas
  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current
      canvas.width = board.width * currentPixelSize
      canvas.height = board.height * currentPixelSize
      setIsCanvasReady(true)
    }
  }, [board.width, board.height, currentPixelSize])

  // Draw pixels on canvas
  useEffect(() => {
    if (!isCanvasReady || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw grid background
    ctx.strokeStyle = '#f0f0f0'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= board.width; x++) {
      ctx.beginPath()
      ctx.moveTo(x * currentPixelSize, 0)
      ctx.lineTo(x * currentPixelSize, board.height * currentPixelSize)
      ctx.stroke()
    }
    for (let y = 0; y <= board.height; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * currentPixelSize)
      ctx.lineTo(board.width * currentPixelSize, y * currentPixelSize)
      ctx.stroke()
    }

    // Draw painted pixels
    pixels.forEach((pixel) => {
      ctx.fillStyle = pixel.color
      ctx.fillRect(
        pixel.x * currentPixelSize + 1,
        pixel.y * currentPixelSize + 1,
        currentPixelSize - 2,
        currentPixelSize - 2
      )
    })

    // Highlight area selection pixels (draw rectangle for selected area)
    if (areaSelectionPixels.length === 2) {
      ctx.save()
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = '#FFD700'
      ctx.shadowColor = '#FFD700'
      ctx.shadowBlur = 0
      const x1 = areaSelectionPixels[0].x
      const y1 = areaSelectionPixels[0].y
      const x2 = areaSelectionPixels[1].x
      const y2 = areaSelectionPixels[1].y
      const fromX = Math.min(x1, x2)
      const fromY = Math.min(y1, y2)
      const toX = Math.max(x1, x2)
      const toY = Math.max(y1, y2)
      ctx.strokeRect(
        fromX * currentPixelSize + 1,
        fromY * currentPixelSize + 1,
        (toX - fromX + 1) * currentPixelSize - 2,
        (toY - fromY + 1) * currentPixelSize - 2
      )
      ctx.restore()
    }

    // Live area selection rectangle preview
    if (areaSelectionActive && areaSelectionFirstPixel && areaSelectionPixels.length === 1 && areaSelectionHoverPixel) {
      ctx.save()
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = '#FFD700'
      ctx.shadowColor = '#FFD700'
      ctx.shadowBlur = 0
      const x1 = areaSelectionFirstPixel.x
      const y1 = areaSelectionFirstPixel.y
      const x2 = areaSelectionHoverPixel.x
      const y2 = areaSelectionHoverPixel.y
      const fromX = Math.min(x1, x2)
      const fromY = Math.min(y1, y2)
      const toX = Math.max(x1, x2)
      const toY = Math.max(y1, y2)
      ctx.strokeRect(
        fromX * currentPixelSize + 1,
        fromY * currentPixelSize + 1,
        (toX - fromX + 1) * currentPixelSize - 2,
        (toY - fromY + 1) * currentPixelSize - 2
      )
      ctx.restore()
    }

    // Draw preview pixels
    if (!readonly) {
      previewPixels.forEach((previewPixel) => {
        // Draw filled preview
        ctx.fillStyle = previewPixel.color
        ctx.fillRect(
          previewPixel.x * currentPixelSize + 1,
          previewPixel.y * currentPixelSize + 1,
          currentPixelSize - 2,
          currentPixelSize - 2
        )
        
        // Draw dashed border for preview
        ctx.strokeStyle = '#666'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.strokeRect(
          previewPixel.x * currentPixelSize,
          previewPixel.y * currentPixelSize,
          currentPixelSize,
          currentPixelSize
        )
        ctx.setLineDash([])
      })
    }

    // Draw hover effect
    if (hoveredPixel && !readonly) {
      ctx.strokeStyle = '#007bff'
      ctx.lineWidth = 2
      ctx.strokeRect(
        hoveredPixel.x * currentPixelSize,
        hoveredPixel.y * currentPixelSize,
        currentPixelSize,
        currentPixelSize
      )
    }

  }, [pixels, previewPixels, hoveredPixel, readonly, board.width, board.height, isCanvasReady, currentPixelSize, areaSelectionActive, areaSelectionPixels, areaSelectionFirstPixel, areaSelectionHoverPixel])

  // Only clear area selection highlights when a new selection is started or after a successful reset/report
  const clearAreaSelection = () => {
    setAreaSelectionPixels([])
    setAreaSelectionFirstPixel(null)
    setAreaSelectionHoverPixel(null)
  }

  // Initialize WebSocket connection
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Use location.host for the WebSocket URL if not set in env
    let wsUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL
    if (!wsUrl) {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      wsUrl = `${protocol}://${window.location.host}`
    }
    const newSocket = io(wsUrl)

    console.log('Client board.id:', board.id, 'type:', typeof board.id)

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket')
      setIsConnected(true)
      newSocket.emit('join-board', board.id)
    })

    newSocket.on('disconnect', () => {
      console.log('Disconnected from WebSocket')
      setIsConnected(false)
    })

    newSocket.on('pixel-update', (data: WebSocketMessage) => {
      console.log('Received pixel update:', data)
      if (data.type === 'PIXEL_UPDATE') {
        const { boardId, x, y, color, newPrice } = data.payload;
        console.log('Comparing event boardId:', boardId, 'type:', typeof boardId, 'with client board.id:', board.id, 'type:', typeof board.id)
        if (String(boardId) !== String(board.id)) return; // Ignore updates for other boards
        console.log('Received pixel update for this board:', { x, y, color, newPrice });
        setPixels(prev => {
          const newPixels = new Map(prev);
          const pixelKey = getPixelKey(x, y);
          newPixels.set(pixelKey, {
            x, y, color,
            price: newPrice,
            timesChanged: (prev.get(pixelKey)?.timesChanged || 0) + 1
          });
          console.log('Updated pixels state for', pixelKey);
          return newPixels;
        });
      }
    });

    // Log every event received from the WebSocket
    newSocket.onAny((event, ...args) => {
      console.log('[WebSocket] Event received:', event, ...args);
    });

    setSocket(newSocket)

    return () => {
      newSocket.disconnect()
    }
  }, [board.id])

  // Keyboard shortcuts for zoom
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Allow shortcuts when body is focused or when canvas container is focused
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      
      if (event.key === '=' || event.key === '+') {
        event.preventDefault()
        zoomIn()
      } else if (event.key === '-') {
        event.preventDefault()
        zoomOut()
      } else if (event.key === '0') {
        event.preventDefault()
        resetZoom()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [zoomIndex])

  // Calculate if content needs scrolling (using useMemo for performance)
  const needsScrolling = React.useMemo(() => {
    const estimatedContainerWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth * 0.9, 1200) : 1000
    return board.width * currentPixelSize > estimatedContainerWidth || board.height * currentPixelSize > 750
  }, [board.width, board.height, currentPixelSize])

  // Update scroll hint text to include zoom info
  const getScrollHintText = () => {
    // Use a reasonable estimate for available container width (accounting for page padding)
    const estimatedContainerWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth * 0.9, 1200) : 1000
    const containerMaxHeight = 750
    const canFitWidth = board.width * currentPixelSize <= estimatedContainerWidth
    const canFitHeight = board.height * currentPixelSize <= containerMaxHeight
    
    if (!canFitWidth || !canFitHeight) {
      return "Scroll to navigate • Mouse wheel or +/- to zoom"
    }
    return "Mouse wheel or +/- to zoom"
  }

  const getCanvasCoordinates = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const x = Math.floor((event.clientX - rect.left) / currentPixelSize)
    const y = Math.floor((event.clientY - rect.top) / currentPixelSize)

    if (x >= 0 && x < board.width && y >= 0 && y < board.height) {
      return { x, y }
    }
    return null
  }

  // Track drawing state for hold-and-draw
  const isDrawing = useRef(false)

  // End drawing if mouse is released anywhere
  useEffect(() => {
    const handleWindowMouseUp = () => {
      isDrawing.current = false
    }
    window.addEventListener('mouseup', handleWindowMouseUp)
    return () => window.removeEventListener('mouseup', handleWindowMouseUp)
  }, [])

  const handleCanvasMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (readonly || !user) return
    isDrawing.current = true
    const coords = getCanvasCoordinates(event)
    if (coords) addToPreview(coords.x, coords.y)
  }

  const handleCanvasMouseUp = () => {
    isDrawing.current = false
  }

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (readonly) return
    const coords = getCanvasCoordinates(event)
    setHoveredPixel(coords)
    if (areaSelectionActive && areaSelectionFirstPixel && areaSelectionPixels.length === 1) {
      setAreaSelectionHoverPixel(coords)
    }
    // Hold-and-draw logic
    if (isDrawing.current && coords && !areaSelectionActive) {
      addToPreview(coords.x, coords.y)
    }
  }

  // End drawing if mouse leaves canvas
  const handleCanvasMouseLeave = () => {
    setHoveredPixel(null)
    isDrawing.current = false
    if (areaSelectionActive) {
      setAreaSelectionHoverPixel(null)
    }
  }

  const handleCanvasRightClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault() // Prevent default context menu
    
    const coords = getCanvasCoordinates(event)
    if (!coords || !user) return

    // Only allow reporting if user has enough credits
    if (user.credits >= 100) {
      setRightClickedPixel(coords)
      setReportPixel(coords)
      setShowReportModal(true)
    }
  }

  const handleCanvasWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    
    if (event.deltaY < 0) {
      // Scroll up = zoom in
      zoomIn()
    } else if (event.deltaY > 0) {
      // Scroll down = zoom out
      zoomOut()
    }
  }

  const getPixelPrice = useCallback((x: number, y: number) => {
    const pixelKey = getPixelKey(x, y)
    const currentPixel = pixels.get(pixelKey)
    return currentPixel?.price || board.startingPixelPrice
  }, [pixels, board.startingPixelPrice])

  const addToPreview = (x: number, y: number) => {
    const pixelKey = getPixelKey(x, y)
    const currentPrice = getPixelPrice(x, y)
    
    setPreviewPixels(prev => {
      const newPreview = new Map(prev)
      
      if (newPreview.has(pixelKey)) {
        // Update existing preview pixel
        newPreview.set(pixelKey, {
          x, y,
          color: selectedColor,
          cost: currentPrice
        })
      } else {
        // Add new preview pixel
        newPreview.set(pixelKey, {
          x, y,
          color: selectedColor,
          cost: currentPrice
        })
      }
      
      return newPreview
    })
  }

  const removeFromPreview = (x: number, y: number) => {
    const pixelKey = getPixelKey(x, y)
    setPreviewPixels(prev => {
      const newPreview = new Map(prev)
      newPreview.delete(pixelKey)
      return newPreview
    })
  }

  const clearPreview = () => {
    setPreviewPixels(new Map())
  }

  const getTotalCost = () => {
    let total = 0
    previewPixels.forEach((previewPixel) => {
      total += previewPixel.cost
    })
    return total
  }

  const isValidHexColor = (color: string) => {
    return /^#[0-9A-F]{6}$/i.test(color)
  }

  const addCustomColor = (color: string) => {
    if (!isValidHexColor(color)) return
    
    setCustomColors(prev => {
      const newColors = prev.filter(c => c !== color) // Remove if already exists
      newColors.unshift(color) // Add to beginning
      return newColors.slice(0, 16) // Keep only 16 colors
    })
  }

  const handleColorPickerSubmit = () => {
    if (isValidHexColor(pickerColor)) {
      setSelectedColor(pickerColor)
      addCustomColor(pickerColor)
      setShowColorPicker(false)
    }
  }

  const applyPreview = async () => {
    if (previewPixels.size === 0 || !user || !socket) return

    const totalCost = getTotalCost()
    if (user.credits < totalCost) {
      alert(`Insufficient credits! You need ${formatCredits(totalCost)} credits but only have ${formatCredits(user.credits)}.`)
      return
    }

    setIsApplying(true)

    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        alert('Please sign in to paint pixels')
        return
      }

      // Apply each pixel in the preview
      const previewArray = Array.from(previewPixels.values())
      
      for (const previewPixel of previewArray) {
        const response = await fetch('/api/pixels/paint', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            boardId: board.id,
            x: previewPixel.x,
            y: previewPixel.y,
            color: previewPixel.color
          })
        })

        const result = await response.json()
        
        if (result.success) {
          // Immediately update local state
          const { newPrice } = result.data
          setPixels(prev => {
            const newPixels = new Map(prev)
            const pixelKey = getPixelKey(previewPixel.x, previewPixel.y)
            newPixels.set(pixelKey, {
              x: previewPixel.x,
              y: previewPixel.y,
              color: previewPixel.color,
              price: newPrice,
              timesChanged: (prev.get(pixelKey)?.timesChanged || 0) + 1
            })
            return newPixels
          })
        } else {
          console.error('Failed to paint pixel:', result.error)
          alert(`Failed to paint pixel at (${previewPixel.x}, ${previewPixel.y}): ${result.error}`)
          break
        }
      }

      // Clear preview and refresh user credits
      clearPreview()
      await refreshUser()
      
    } catch (error) {
      console.error('Error applying preview:', error)
      alert('Failed to apply changes')
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <div className={`canvas-board ${className || ''}`}>
      {/* Connection Status */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        {user && (
          <div className="text-sm font-medium">
            Credits: {formatCredits(user.credits)}
          </div>
        )}
      </div>

      {/* Color Palette */}
      {!readonly && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700">Colors</h3>
            <div className="flex items-center gap-2">
              <div 
                className="w-6 h-6 rounded border-2 border-gray-300"
                style={{ backgroundColor: selectedColor }}
                title={`Selected: ${selectedColor}`}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="text-xs"
              >
                {showColorPicker ? 'Hide' : 'Custom'}
              </Button>
            </div>
          </div>

          {/* Preset Colors */}
          <div className="mb-3">
            <p className="text-xs text-gray-500 mb-2">Presets</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  className={`w-8 h-8 rounded border-2 ${
                    selectedColor === color ? 'border-gray-400' : 'border-gray-200'
                  } hover:border-gray-400 transition-colors`}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColor(color)}
                  title={color}
                />
              ))}
            </div>
          </div>

          {/* Custom Colors */}
          {customColors.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-2">Your Colors ({customColors.length}/16)</p>
              <div className="flex flex-wrap gap-2">
                {customColors.map((color, index) => (
                  <button
                    key={`custom-${index}`}
                    className={`w-8 h-8 rounded border-2 ${
                      selectedColor === color ? 'border-gray-400' : 'border-gray-200'
                    } hover:border-gray-400 transition-colors`}
                    style={{ backgroundColor: color }}
                    onClick={() => setSelectedColor(color)}
                    title={color}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Color Picker */}
          {showColorPicker && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-xs text-gray-600 mb-2">Custom Color Picker</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={pickerColor}
                  onChange={(e) => setPickerColor(e.target.value.toUpperCase())}
                  className="w-12 h-8 rounded border cursor-pointer"
                />
                <input
                  type="text"
                  value={pickerColor}
                  onChange={(e) => setPickerColor(e.target.value.toUpperCase())}
                  placeholder="#FF0000"
                  className="px-2 py-1 text-sm border rounded w-20 font-mono"
                  maxLength={7}
                />
                <Button
                  size="sm"
                  onClick={handleColorPickerSubmit}
                  disabled={!isValidHexColor(pickerColor)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Use
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Enter any hex color (e.g., #FF5733) or use the picker
              </p>
            </div>
          )}
        </div>
      )}

      {/* Preview Controls or Placeholder */}
      {!readonly ? (
        previewPixels.size > 0 ? (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Preview ({previewPixels.size} pixel{previewPixels.size !== 1 ? 's' : ''})
              </h3>
              <div className="text-sm font-medium text-yellow-800">
                Total Cost: {formatCredits(getTotalCost())} credits
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={applyPreview}
                disabled={isApplying || !user || user.credits < getTotalCost()}
                className="bg-green-600 hover:bg-green-700 text-white"
                size="sm"
              >
                {isApplying ? 'Applying...' : 'Apply Changes'}
              </Button>
              <Button
                onClick={clearPreview}
                disabled={isApplying}
                variant="outline"
                size="sm"
              >
                Clear Preview
              </Button>
            </div>
            {user && user.credits < getTotalCost() && (
              <p className="text-xs text-red-600 mt-2">
                Insufficient credits! You need {formatCredits(getTotalCost() - user.credits)} more credits.
              </p>
            )}
          </div>
        ) : (
          <div className="mb-4" style={{ minHeight: 96 }} />
        )
      ) : null}

      {/* Canvas Container with Scrolling */}
      <div className="space-y-2">
        {/* Zoom Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Zoom:</span>
            <button
              onClick={zoomOut}
              disabled={zoomIndex === 0}
              className="px-2 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              −
            </button>
            <span className="text-sm font-mono min-w-[3rem] text-center">
              {displayZoomPercentage}
            </span>
            <button
              onClick={zoomIn}
              disabled={zoomIndex === ZOOM_LEVELS.length - 1}
              className="px-2 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              +
            </button>
            <button
              onClick={resetZoom}
              className="px-2 py-1 text-sm border rounded hover:bg-gray-100"
            >
              Reset
            </button>
          </div>
          
          {/* Scroll hint for larger boards or zoom hint */}
          <div className="text-xs text-gray-500 flex items-center gap-1">
            {needsScrolling ? (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                </svg>
                <span>{getScrollHintText()}</span>
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
                <span>Mouse wheel or +/- to zoom</span>
              </>
            )}
          </div>
        </div>
        
        <div 
          className="border border-gray-300 bg-gray-50 overflow-auto rounded-lg shadow-inner w-full"
          style={{
            maxHeight: '750px',
            minHeight: '200px'
          }}
          tabIndex={0}
        >
          <div className="inline-block">
            <canvas
              ref={canvasRef}
              className={readonly ? 'cursor-default' : 'cursor-pointer'}
              onClick={handleCanvasClick}
              onContextMenu={handleCanvasRightClick}
              onMouseDown={handleCanvasMouseDown}
              onMouseUp={handleCanvasMouseUp}
              onMouseMove={handleCanvasMouseMove}
              onMouseLeave={handleCanvasMouseLeave}
              style={{ imageRendering: 'pixelated', display: 'block' }}
            />
          </div>
        </div>
      </div>

      {/* Instructions */}
      {!readonly && user && (
        <div className="mt-4 text-sm text-gray-600">
          <p><strong>How to paint:</strong></p>
          <ul className="ml-4 mt-1 space-y-1">
            <li>• Use preset colors or create custom colors with the picker</li>
            <li>• Custom colors are saved automatically (up to 16)</li>
            <li>• Click pixels to preview your changes</li>
            <li>• Click "Apply Changes" to confirm and spend credits</li>
          </ul>
        </div>
      )}

      {/* Hover Info - Always reserve space to prevent layout shifts */}
      {!readonly && (
        <div className="mt-4 p-3 bg-gray-50 rounded min-h-[64px] flex flex-col justify-center">
          {hoveredPixel ? (
            <>
              <div className="text-sm">
                <strong>Pixel ({hoveredPixel.x}, {hoveredPixel.y})</strong>
              </div>
              <div className="text-sm text-gray-600">
                Price: {formatCredits(getPixelPrice(hoveredPixel.x, hoveredPixel.y))} credits
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-500 text-center">
              Hover over pixels to see pricing info
            </div>
          )}
        </div>
      )}

      {/* Trusted User Controls */}
      {!readonly && (
        <TrustedUserControls
          boardId={board.id}
          boardWidth={board.width}
          boardHeight={board.height}
          onCanvasReset={() => {
            // Force canvas refresh after reset by clearing and reloading pixels
            window.location.reload()
          }}
          areaSelectionActive={areaSelectionActive}
          onRequestAreaSelection={setAreaSelectionActive}
          onAreaPixelClick={handleAreaPixelClick}
          clearAreaSelection={clearAreaSelection}
        />
      )}

      {/* Readonly Notice */}
      {readonly && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <p className="text-blue-800 text-sm">
            👀 <strong>View Only:</strong> {!user ? 'Sign in to start painting!' : 'This board is frozen or inactive.'}
          </p>
        </div>
      )}

      {/* Report Pixel Modal */}
      {reportPixel && (
        <ReportPixelModal
          isOpen={showReportModal}
          onClose={() => {
            setShowReportModal(false)
            setReportPixel(null)
            setRightClickedPixel(null)
          }}
          pixelX={reportPixel.x}
          pixelY={reportPixel.y}
          boardId={board.id}
        />
      )}
    </div>
  )
} 