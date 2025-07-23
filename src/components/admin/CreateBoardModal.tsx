'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'

interface CreateBoardModalProps {
  isOpen: boolean
  onClose: () => void
  onBoardCreated: () => void
}

export function CreateBoardModal({ isOpen, onClose, onBoardCreated }: CreateBoardModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    width: 100,
    height: 100,
    startingPixelPrice: 100,
    priceMultiplier: 1.2,
    endDate: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/boards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.name,
          width: formData.width,
          height: formData.height,
          startingPixelPrice: formData.startingPixelPrice,
          priceMultiplier: formData.priceMultiplier,
          endDate: formData.endDate ? new Date(formData.endDate).toISOString() : undefined
        })
      })

      const result = await response.json()
      if (result.success) {
        onBoardCreated()
        onClose()
        // Reset form
        setFormData({
          name: '',
          width: 100,
          height: 100,
          startingPixelPrice: 100,
          priceMultiplier: 1.2,
          endDate: ''
        })
      } else {
        alert('Failed to create board: ' + result.error)
      }
    } catch (error) {
      console.error('Error creating board:', error)
      alert('Failed to create board')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Create New Board</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Board Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  placeholder="Enter board name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Width *
                  </label>
                  <input
                    type="number"
                    required
                    min="10"
                    max="1000"
                    value={formData.width}
                    onChange={(e) => setFormData({ ...formData, width: parseInt(e.target.value) || 10 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Height *
                  </label>
                  <input
                    type="number"
                    required
                    min="10"
                    max="1000"
                    value={formData.height}
                    onChange={(e) => setFormData({ ...formData, height: parseInt(e.target.value) || 10 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Starting Price (credits) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max="10000"
                  value={formData.startingPixelPrice}
                  onChange={(e) => setFormData({ ...formData, startingPixelPrice: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price Multiplier *
                </label>
                <input
                  type="number"
                  required
                  min="1.0"
                  max="5.0"
                  step="0.1"
                  value={formData.priceMultiplier}
                  onChange={(e) => setFormData({ ...formData, priceMultiplier: parseFloat(e.target.value) || 1.0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date/Time (optional)
                </label>
                <input
                  type="datetime-local"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
                <p className="text-xs text-gray-500 mt-1">Leave empty for no expiration</p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                {isSubmitting ? 'Creating...' : 'Create Board'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
} 