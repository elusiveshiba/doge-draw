'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/providers/AuthProvider'
import { BoardWithPixels } from '@/types'
import { formatCredits } from '@/lib/utils'
import { BoardPreview } from '@/components/canvas/BoardPreview'
import { CreateBoardModal } from '@/components/admin/CreateBoardModal'

export default function BoardsPage() {
  const { user, isLoading } = useAuth()
  const [boards, setBoards] = useState<BoardWithPixels[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deletingBoard, setDeletingBoard] = useState<string | null>(null)
  const [exportingBoard, setExportingBoard] = useState<string | null>(null)

  useEffect(() => {
    fetchBoards()
  }, [user])

  const fetchBoards = async () => {
    try {
      setLoading(true)
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }

      if (user) {
        const token = localStorage.getItem('auth_token')
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
      }

      const response = await fetch('/api/boards', { headers })
      const result = await response.json()

      if (result.success) {
        setBoards(result.data)
      } else {
        setError(result.error || 'Failed to fetch boards')
      }
    } catch (err) {
      setError('Failed to load boards')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteBoard = async (boardId: string, boardName: string) => {
    if (!window.confirm(`Are you sure you want to delete the board "${boardName}"? This action cannot be undone and will delete all pixels and history.`)) {
      return
    }

    try {
      setDeletingBoard(boardId)
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`/api/boards/${boardId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const result = await response.json()
      if (result.success) {
        setBoards(boards => boards.filter(b => b.id !== boardId))
      } else {
        alert('Failed to delete board: ' + result.error)
      }
    } catch (error) {
      console.error('Error deleting board:', error)
      alert('Failed to delete board')
    } finally {
      setDeletingBoard(null)
    }
  }

  const handleExportBoard = async (boardId: string, boardName: string) => {
    try {
      setExportingBoard(boardId)
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`/api/admin/boards/${boardId}/export`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Export failed')
      }

      // Get the filename from Content-Disposition header or create one
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = `board_${boardName.replace(/[^a-zA-Z0-9]/g, '_')}_${boardId}_${new Date().toISOString().split('T')[0]}.json`
      
      if (contentDisposition) {
        const matches = contentDisposition.match(/filename="([^"]+)"/)
        if (matches) {
          filename = matches[1]
        }
      }

      // Create download
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

    } catch (error) {
      console.error('Error exporting board:', error)
      alert('Failed to export board: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setExportingBoard(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-yellow-500"></div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Art Boards
        </h1>
        <p className="text-gray-600">
          Choose a canvas to start painting collaborative pixel art
        </p>
      </div>

      {!user && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-yellow-800">Sign in to start painting</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Create an account to purchase credits and paint pixels
              </p>
            </div>
            <Link href="/auth">
              <Button variant="doge" size="sm">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {boards.map((board) => (
          <div key={board.id} className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{board.name}</h3>
                <div className="flex items-center space-x-2">
                  {board.isFrozen && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Frozen
                    </span>
                  )}
                  {!board.isActive && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      Inactive
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm text-gray-600 mb-4">
                <div className="flex justify-between">
                  <span>Size:</span>
                  <span>{board.width} × {board.height}</span>
                </div>
                <div className="flex justify-between">
                  <span>Starting Price:</span>
                  <span>{formatCredits(board.startingPixelPrice)} credits</span>
                </div>
                <div className="flex justify-between">
                  <span>Price Multiplier:</span>
                  <span>{board.priceMultiplier}×</span>
                </div>
                <div className="flex justify-between">
                  <span>Pixels Painted:</span>
                  <span>{board.pixels.length.toLocaleString()}</span>
                </div>
                {board.endDate && (
                  <div className="flex justify-between">
                    <span>Expiration:</span>
                    <span className={`${
                      (() => {
                        const now = new Date();
                        const endDate = new Date(board.endDate);
                        const hoursUntilExpiry = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60);
                        return hoursUntilExpiry <= 24 ? 'text-red-600 font-medium' : 'text-orange-600 font-medium';
                      })()
                    }`}>
                      {new Date(board.endDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Mini canvas preview */}
              <div className="mb-4">
                <BoardPreview board={board} maxWidth={300} maxHeight={120} />
              </div>

              <div className="flex space-x-2">
                <Link href={`/boards/${board.id}`} className="flex-1">
                  <Button 
                    variant={board.isActive && !board.isFrozen ? "doge" : "outline"} 
                    className="w-full"
                    disabled={!board.isActive}
                  >
                    {board.isFrozen ? 'View Archive' : 'Paint'}
                  </Button>
                </Link>
                {user?.isAdmin && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExportBoard(board.id, board.name)}
                      disabled={exportingBoard === board.id}
                      className="border-blue-300 text-blue-700 hover:bg-blue-50 px-3"
                      title="Export board with full history"
                    >
                      {exportingBoard === board.id ? '📦' : '📦'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteBoard(board.id, board.name)}
                      disabled={deletingBoard === board.id}
                      className="border-red-300 text-red-700 hover:bg-red-50 px-3"
                    >
                      {deletingBoard === board.id ? '🗑️' : '🗑️'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {boards.length === 0 && !loading && (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No boards available</h3>
          <p className="text-gray-600 mb-4">
            {user?.isAdmin 
              ? "Create the first board to get started" 
              : "Check back soon for new collaborative canvases"
            }
          </p>
          {user?.isAdmin && (
            <Button 
              variant="doge"
              onClick={() => setShowCreateModal(true)}
            >
              Create First Board
            </Button>
          )}
        </div>
      )}

      {user?.isAdmin && boards.length > 0 && (
        <div className="text-center mt-8">
          <Button 
            variant="outline"
            onClick={() => setShowCreateModal(true)}
          >
            Create New Board
          </Button>
        </div>
      )}

      <CreateBoardModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onBoardCreated={() => {
          setShowCreateModal(false)
          fetchBoards() // Refresh the boards list
        }}
      />
    </div>
  )
} 