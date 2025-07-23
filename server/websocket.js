const { Server } = require('socket.io')
const { createServer } = require('http')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:6832",
    methods: ["GET", "POST"]
  }
})

// Store active board connections
const boardConnections = new Map()

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)

  // Join a specific board room
  socket.on('join-board', async (boardId) => {
    try {
      // Leave previous board rooms
      const rooms = Array.from(socket.rooms)
      rooms.forEach(room => {
        if (room.startsWith('board-')) {
          socket.leave(room)
        }
      })

      // Join new board room
      const roomName = `board-${boardId}`
      socket.join(roomName)
      
      // Track connection
      if (!boardConnections.has(boardId)) {
        boardConnections.set(boardId, new Set())
      }
      boardConnections.get(boardId).add(socket.id)

      console.log(`Socket ${socket.id} joined board ${boardId}`)

      // Send current board state
      const board = await prisma.board.findUnique({
        where: { id: boardId },
        include: {
          pixels: {
            where: { isHidden: false }
          }
        }
      })

      if (board) {
        const pixels = board.pixels.map(pixel => ({
          x: pixel.x,
          y: pixel.y,
          color: pixel.color,
          price: pixel.currentPrice,
          timesChanged: pixel.timesChanged
        }))

        socket.emit('board-state', {
          type: 'BOARD_STATE',
          payload: {
            boardId,
            pixels
          }
        })
      }

    } catch (error) {
      console.error('Error joining board:', error)
      socket.emit('error', { message: 'Failed to join board' })
    }
  })

  // Handle pixel updates
  socket.on('pixel-painted', async (data) => {
    try {
      const { boardId, x, y, color, newPrice, userId } = data
      
      // Broadcast to all clients in the board room
      socket.to(`board-${boardId}`).emit('pixel-update', {
        type: 'PIXEL_UPDATE',
        payload: {
          boardId,
          x,
          y,
          color,
          newPrice,
          userId
        }
      })

      console.log(`Pixel painted on board ${boardId} at (${x}, ${y}) by user ${userId}`)

    } catch (error) {
      console.error('Error handling pixel paint:', error)
    }
  })

  // Handle user credit updates
  socket.on('credits-updated', (data) => {
    const { userId, newCredits } = data
    
    // Broadcast to all user's connections
    io.emit('credits-update', {
      type: 'CREDITS_UPDATE',
      payload: {
        userId,
        newCredits
      }
    })
  })

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id)
    
    // Remove from board connections
    boardConnections.forEach((connections, boardId) => {
      if (connections.has(socket.id)) {
        connections.delete(socket.id)
        if (connections.size === 0) {
          boardConnections.delete(boardId)
        }
      }
    })
  })
})

// Broadcast pixel reports/hiding
async function broadcastPixelHidden(boardId, x, y) {
  io.to(`board-${boardId}`).emit('pixel-hidden', {
    type: 'PIXEL_HIDDEN',
    payload: { boardId, x, y }
  })
}

// Broadcast board status changes
async function broadcastBoardStatus(boardId, status) {
  io.to(`board-${boardId}`).emit('board-status', {
    type: 'BOARD_STATUS',
    payload: { boardId, status }
  })
}

const PORT = process.env.WEBSOCKET_PORT || 3001

httpServer.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`)
})

// Export functions for use in API routes
module.exports = {
  io,
  broadcastPixelHidden,
  broadcastBoardStatus
} 