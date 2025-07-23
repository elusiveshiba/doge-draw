'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/providers/AuthProvider'

interface ReportPixelModalProps {
  isOpen: boolean
  onClose: () => void
  pixelX: number
  pixelY: number
  boardId: string
}

const REPORT_REASONS = [
  'Inappropriate content',
  'Offensive imagery',
  'Spam/vandalism',
  'Copyright violation',
  'Other harassment',
  'Other'
] as const

export function ReportPixelModal({ isOpen, onClose, pixelX, pixelY, boardId }: ReportPixelModalProps) {
  const { user } = useAuth()
  const [selectedReason, setSelectedReason] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const canReport = user && user.credits >= 100

  const handleSubmit = async () => {
    if (!user || !canReport) return
    
    setIsSubmitting(true)
    setError('')

    try {
      const reason = selectedReason === 'Other' ? customReason : selectedReason
      
      if (!reason.trim()) {
        setError('Please select or enter a reason for reporting')
        return
      }

      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/pixels/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          pixelId: `${boardId}_${pixelX}_${pixelY}`, // This would need to be the actual pixel ID
          reason: reason.trim()
        })
      })

      const data = await response.json()

      if (data.success) {
        alert(`Pixel reported successfully. ${data.reportCount}/5 reports needed to hide this pixel.`)
        onClose()
        setSelectedReason('')
        setCustomReason('')
      } else {
        setError(data.error || 'Failed to submit report')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Report Pixel</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </Button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">
            Reporting pixel at position ({pixelX}, {pixelY})
          </p>
          
          {!canReport && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-red-800 text-sm">
                You need at least 100 credits to submit reports. 
                Current balance: {user?.credits || 0} credits
              </p>
            </div>
          )}
        </div>

        {canReport && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for reporting:
              </label>
              <div className="space-y-2">
                {REPORT_REASONS.map((reason) => (
                  <label key={reason} className="flex items-center">
                    <input
                      type="radio"
                      name="reason"
                      value={reason}
                      checked={selectedReason === reason}
                      onChange={(e) => setSelectedReason(e.target.value)}
                      className="mr-2"
                    />
                    <span className="text-sm">{reason}</span>
                  </label>
                ))}
              </div>
            </div>

            {selectedReason === 'Other' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Please specify:
                </label>
                <textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md text-sm"
                  rows={3}
                  placeholder="Describe the issue..."
                  maxLength={200}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {customReason.length}/200 characters
                </p>
              </div>
            )}

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}
          </>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          {canReport && (
            <Button
              variant="destructive"
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedReason}
              className="flex-1"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
} 