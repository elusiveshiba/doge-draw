'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/providers/AuthProvider'
import { CanvasBoard } from '@/components/canvas/CanvasBoard'
import { BoardAdminControls } from '@/components/admin/BoardAdminControls'
import { BoardWithPixels } from '@/types'

export default function BoardPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const [board, setBoard] = useState<BoardWithPixels | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchBoard = async () => {
      try {
        const response = await fetch(`/api/boards/${params.id}`)
        const result = await response.json()
        
        if (result.success) {
          setBoard(result.data)
        } else {
          setError(result.error || 'Failed to load board')
        }
      } catch (err) {
        console.error('Error fetching board:', err)
        setError('Failed to load board')
      } finally {
        setLoading(false)
      }
    }

    if (params.id) {
      fetchBoard()
    }
  }, [params.id])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading board...</p>
        </div>
      </div>
    )
  }

  if (error || !board) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">😞</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Board Not Found</h1>
          <p className="text-gray-600 mb-4">{error || 'The requested board could not be found.'}</p>
          <button
            onClick={() => router.push('/boards')}
            className="bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700 transition-colors"
          >
            Back to Boards
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Board Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{board.name}</h1>
              <p className="text-gray-600">
                {board.width} × {board.height} pixels • 
                Starting price: {board.startingPixelPrice} credits • 
                Multiplier: {board.priceMultiplier}x
                {board.endDate && (
                  <>
                    {' • '}
                    <span className={`${new Date(board.endDate) < new Date() ? 'text-red-600 font-medium' : 'text-orange-600 font-medium'}`}>
                      Ends: {new Date(board.endDate).toLocaleDateString()} at {new Date(board.endDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </>
                )}
              </p>
            </div>
            
            <div className="text-right">
              {board.isFrozen && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 mb-2">
                  🧊 Frozen
                </span>
              )}
              {board.endDate && new Date(board.endDate) < new Date() && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 mb-2 block">
                  ⏰ Ended
                </span>
              )}
              <div className="text-sm text-gray-600">
                Status: <span className={board.isActive ? 'text-green-600' : 'text-red-600'}>
                  {board.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>

          {/* Sign-in prompt for non-authenticated users */}
          {!user && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <p className="text-yellow-800">
                <strong>Sign in to start painting!</strong> You can view the board, but you'll need an account to paint pixels.
              </p>
            </div>
          )}
        </div>

        {/* Admin Controls */}
        {user?.isAdmin && (
          <BoardAdminControls 
            board={board} 
            onBoardUpdate={(updatedBoard) => setBoard(updatedBoard)}
          />
        )}

        {/* Canvas Board */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <CanvasBoard 
            board={board}
            readonly={!user || board.isFrozen || !board.isActive}
          />
        </div>
      </div>
    </div>
  )
} 