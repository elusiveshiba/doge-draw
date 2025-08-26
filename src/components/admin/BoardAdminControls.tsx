'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { BoardWithPixels } from '@/types'

interface BoardAdminControlsProps {
  board: BoardWithPixels
  onBoardUpdate: (updatedBoard: BoardWithPixels) => void
}

export function BoardAdminControls({ board, onBoardUpdate }: BoardAdminControlsProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [editData, setEditData] = useState({
    name: board.name,
    width: board.width,
    height: board.height,
    startingPixelPrice: board.startingPixelPrice,
    priceMultiplier: board.priceMultiplier,
    isActive: board.isActive,
    endDate: board.endDate ? new Date(board.endDate).toISOString().slice(0, 16) : ''
  })

  const handleSave = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`/api/boards/${board.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editData.name,
          width: parseInt(editData.width.toString()),
          height: parseInt(editData.height.toString()),
          startingPixelPrice: parseInt(editData.startingPixelPrice.toString()),
          priceMultiplier: parseFloat(editData.priceMultiplier.toString()),
          isActive: editData.isActive,
          endDate: editData.endDate ? new Date(editData.endDate).toISOString() : null
        })
      })

      const result = await response.json()
      if (result.success) {
        onBoardUpdate(result.data)
        setIsEditing(false)
      } else {
        alert('Failed to update board: ' + result.error)
      }
    } catch (error) {
      console.error('Error updating board:', error)
      alert('Failed to update board')
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this board? This action cannot be undone.')) {
      return
    }

    try {
      setIsDeleting(true)
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`/api/boards/${board.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const result = await response.json()
      if (result.success) {
        router.push('/boards')
      } else {
        alert('Failed to delete board: ' + result.error)
      }
    } catch (error) {
      console.error('Error deleting board:', error)
      alert('Failed to delete board')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleExport = async () => {
    try {
      setIsExporting(true)
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`/api/admin/boards/${board.id}/export`, {
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
      let filename = `board_${board.name.replace(/[^a-zA-Z0-9]/g, '_')}_${board.id}_${new Date().toISOString().split('T')[0]}.json`
      
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
      setIsExporting(false)
    }
  }

  if (!isEditing) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-yellow-800">Admin Controls</h3>
            <p className="text-yellow-700 text-sm">Manage this board&apos;s settings and status</p>
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="border-yellow-300 text-yellow-700 hover:bg-yellow-100"
            >
              ✏️ Edit Board
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isExporting}
              className="border-blue-300 text-blue-700 hover:bg-blue-100"
            >
              {isExporting ? '📦 Exporting...' : '📦 Export Board'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="border-red-300 text-red-700 hover:bg-red-100"
            >
              {isDeleting ? '🗑️ Deleting...' : '🗑️ Delete Board'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
      <h3 className="text-lg font-medium text-yellow-800 mb-4">Edit Board Settings</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Board Name</label>
          <input
            type="text"
            value={editData.name}
            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
        </div>

        <div className="flex items-center space-x-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={editData.isActive}
              onChange={(e) => setEditData({ ...editData, isActive: e.target.checked })}
              className="rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
            />
            <span className="ml-2 text-sm text-gray-700">Board is Live/Active</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Width (pixels)</label>
          <input
            type="number"
            min="10"
            max="1000"
            value={editData.width}
            onChange={(e) => setEditData({ ...editData, width: parseInt(e.target.value) || 10 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Height (pixels)</label>
          <input
            type="number"
            min="10"
            max="1000"
            value={editData.height}
            onChange={(e) => setEditData({ ...editData, height: parseInt(e.target.value) || 10 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Starting Price (credits)</label>
          <input
            type="number"
            min="1"
            max="10000"
            value={editData.startingPixelPrice}
            onChange={(e) => setEditData({ ...editData, startingPixelPrice: parseInt(e.target.value) || 1 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Price Multiplier</label>
          <input
            type="number"
            min="1.0"
            max="5.0"
            step="0.1"
            value={editData.priceMultiplier}
            onChange={(e) => setEditData({ ...editData, priceMultiplier: parseFloat(e.target.value) || 1.0 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">End Date/Time (optional)</label>
          <input
            type="datetime-local"
            value={editData.endDate}
            onChange={(e) => setEditData({ ...editData, endDate: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
          <p className="text-xs text-gray-500 mt-1">Leave empty for no expiration date</p>
        </div>
      </div>

      <div className="flex justify-end space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setIsEditing(false)
            setEditData({
              name: board.name,
              width: board.width,
              height: board.height,
              startingPixelPrice: board.startingPixelPrice,
              priceMultiplier: board.priceMultiplier,
              isActive: board.isActive,
              endDate: board.endDate ? new Date(board.endDate).toISOString().slice(0, 16) : ''
            })
          }}
          className="border-gray-300"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          className="bg-yellow-600 hover:bg-yellow-700 text-white"
        >
          Save Changes
        </Button>
      </div>
    </div>
  )
} 