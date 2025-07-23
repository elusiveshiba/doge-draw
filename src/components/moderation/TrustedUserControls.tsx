'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/providers/AuthProvider'

interface TrustedUserControlsProps {
  boardId: string
  boardWidth: number
  boardHeight: number
  onCanvasReset?: () => void
  areaSelectionActive: boolean
  onRequestAreaSelection: (active: boolean) => void
  onAreaPixelClick: (from: {x: number, y: number}, to: {x: number, y: number}) => void
  clearAreaSelection: () => void
}

declare global {
  interface Window {
    __dogeDrawAreaPixelClick?: (x: number, y: number) => void;
  }
}

export function TrustedUserControls({ boardId, boardWidth, boardHeight, onCanvasReset, areaSelectionActive, onRequestAreaSelection, onAreaPixelClick, clearAreaSelection }: TrustedUserControlsProps) {
  const { user } = useAuth()
  const [isResetting, setIsResetting] = useState(false)
  const [isReporting, setIsReporting] = useState(false)
  const [resetArea, setResetArea] = useState({
    fromX: 0,
    fromY: 0,
    toX: 99,
    toY: 99
  })
  const [reportArea, setReportArea] = useState<{fromX: number, fromY: number, toX: number, toY: number} | null>(null)
  const [resetReason, setResetReason] = useState('')
  const [reportReason, setReportReason] = useState('Inappropriate content')
  const [showResetForm, setShowResetForm] = useState(false)
  const [showReportForm, setShowReportForm] = useState(false)
  const [error, setError] = useState('')
  const [areaClicks, setAreaClicks] = useState<{x: number, y: number}[]>([])
  const [mode, setMode] = useState<'reset' | 'report' | null>(null)

  // Only show for trusted users or admins
  if (!user || (!user.isTrusted && !user.isAdmin)) {
    return null
  }

  // Handle pixel click from parent (CanvasBoard)
  React.useEffect(() => {
    if (areaSelectionActive && areaClicks.length === 2) {
      if (mode === 'reset') {
        setResetArea({
          fromX: areaClicks[0].x,
          fromY: areaClicks[0].y,
          toX: areaClicks[1].x,
          toY: areaClicks[1].y
        })
      } else if (mode === 'report') {
        setReportArea({
          fromX: areaClicks[0].x,
          fromY: areaClicks[0].y,
          toX: areaClicks[1].x,
          toY: areaClicks[1].y
        })
      }
      onAreaPixelClick(areaClicks[0], areaClicks[1])
      setAreaClicks([])
      onRequestAreaSelection(false) // Exit area selection mode after 2nd pixel, but do NOT clear highlight
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaClicks, areaSelectionActive, mode])

  // Called by parent when a pixel is clicked in area selection mode
  const handleAreaPixelClick = (x: number, y: number) => {
    if (!areaSelectionActive) return
    setAreaClicks(prev => prev.length < 2 ? [...prev, {x, y}] : prev)
  }

  // Expose handler to parent
  React.useEffect(() => {
    if (areaSelectionActive) {
      window.__dogeDrawAreaPixelClick = handleAreaPixelClick
    } else {
      window.__dogeDrawAreaPixelClick = undefined
    }
    return () => { window.__dogeDrawAreaPixelClick = undefined }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaSelectionActive])

  // --- RESET LOGIC ---
  const handleCanvasReset = async () => {
    if (!resetReason.trim()) {
      setError('Please provide a reason for the reset')
      return
    }
    // Validate coordinates
    if (resetArea.fromX < 0 || resetArea.fromY < 0 || 
        resetArea.toX >= boardWidth || resetArea.toY >= boardHeight ||
        resetArea.fromX > resetArea.toX || resetArea.fromY > resetArea.toY) {
      setError('Invalid coordinates. Please check the reset area bounds.')
      return
    }
    // Check reset area size (max 100x100)
    const resetWidth = resetArea.toX - resetArea.fromX + 1
    const resetHeight = resetArea.toY - resetArea.fromY + 1
    const resetSize = resetWidth * resetHeight
    if (resetSize > 10000) { // 100x100 = 10,000 pixels
      setError('Reset area too large. Maximum 100x100 pixels (10,000 total).')
      return
    }
    // Build array of all pixels in the area
    const pixels: {x: number, y: number}[] = []
    for (let x = Math.min(resetArea.fromX, resetArea.toX); x <= Math.max(resetArea.fromX, resetArea.toX); x++) {
      for (let y = Math.min(resetArea.fromY, resetArea.toY); y <= Math.max(resetArea.fromY, resetArea.toY); y++) {
        pixels.push({ x, y })
      }
    }
    setIsResetting(true)
    setError('')
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/moderation/canvas-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          boardId,
          pixels,
          reason: resetReason.trim()
        })
      })
      const data = await response.json()
      if (data.success) {
        alert(`Canvas area reset successfully. ${data.pixelsReset ?? data.affectedPixels ?? 0} pixels cleared.`)
        setShowResetForm(false)
        setResetReason('')
        setResetArea({ fromX: 0, fromY: 0, toX: 99, toY: 99 })
        setMode(null)
        onCanvasReset?.()
        onRequestAreaSelection(false)
        clearAreaSelection() // Clear highlight after successful reset
      } else {
        setError(data.error || 'Failed to reset canvas area')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setIsResetting(false)
    }
  }

  // --- REPORT LOGIC ---
  const handleAreaReport = async () => {
    if (!reportArea) return
    // Build array of all pixels in the area
    const pixels: {x: number, y: number}[] = []
    for (let x = Math.min(reportArea.fromX, reportArea.toX); x <= Math.max(reportArea.fromX, reportArea.toX); x++) {
      for (let y = Math.min(reportArea.fromY, reportArea.toY); y <= Math.max(reportArea.fromY, reportArea.toY); y++) {
        pixels.push({ x, y })
      }
    }
    setIsReporting(true)
    setError('')
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/pixels/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ boardId, pixels, reason: reportReason })
      })
      const data = await response.json()
      if (data.success) {
        alert('Area reported! Each pixel in the area has been reported.')
        setShowReportForm(false)
        setReportArea(null)
        setMode(null)
        onRequestAreaSelection(false)
        clearAreaSelection() // Clear highlight after successful report
      } else {
        setError(data.errors?.join(', ') || data.error || 'Failed to report area')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setIsReporting(false)
    }
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
        <h3 className="font-medium text-yellow-800">
          {user.isAdmin ? 'Admin' : 'Trusted User'} Controls
        </h3>
      </div>

      {user.isAdmin && (
        <div className="mb-2 text-green-700 text-sm font-semibold">No cost for admins to reset area.</div>
      )}

      {/* Main action buttons */}
      {!showResetForm && !showReportForm && (
        <div className="space-y-3">
          <p className="text-sm text-yellow-700">
            As a {user.isAdmin ? 'admin' : 'trusted user'}, you can reset or report sections of the canvas to remove inappropriate content.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowResetForm(true); setMode('reset'); }}
              className="border-yellow-300 text-yellow-800 hover:bg-yellow-100"
            >
              Reset Canvas Section
            </Button>
            {(user.isTrusted || user.isAdmin) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowReportForm(true); setMode('report'); }}
                className="border-red-300 text-red-700 hover:bg-red-100"
              >
                Report Area
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Reset Form */}
      {showResetForm && (
        <div className="space-y-4">
          <div className="flex gap-2 mb-2">
            <Button
              variant={areaSelectionActive ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => {
                onRequestAreaSelection(!areaSelectionActive)
                setAreaClicks([])
              }}
              className="border-yellow-300 text-yellow-800"
            >
              {areaSelectionActive ? 'Cancel Area Selection' : 'Select Area on Canvas'}
            </Button>
            {areaSelectionActive && (
              <span className="text-xs text-yellow-700 self-center">Click two pixels on the canvas to set area</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-yellow-800 mb-1">
                From Position
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="X"
                  value={resetArea.fromX}
                  onChange={(e) => setResetArea(prev => ({ ...prev, fromX: parseInt(e.target.value) || 0 }))}
                  min={0}
                  max={boardWidth - 1}
                  className="w-16 p-1 border border-gray-300 rounded text-sm"
                  disabled={areaSelectionActive}
                />
                <input
                  type="number"
                  placeholder="Y"
                  value={resetArea.fromY}
                  onChange={(e) => setResetArea(prev => ({ ...prev, fromY: parseInt(e.target.value) || 0 }))}
                  min={0}
                  max={boardHeight - 1}
                  className="w-16 p-1 border border-gray-300 rounded text-sm"
                  disabled={areaSelectionActive}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-yellow-800 mb-1">
                To Position
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="X"
                  value={resetArea.toX}
                  onChange={(e) => setResetArea(prev => ({ ...prev, toX: parseInt(e.target.value) || 0 }))}
                  min={0}
                  max={boardWidth - 1}
                  className="w-16 p-1 border border-gray-300 rounded text-sm"
                  disabled={areaSelectionActive}
                />
                <input
                  type="number"
                  placeholder="Y"
                  value={resetArea.toY}
                  onChange={(e) => setResetArea(prev => ({ ...prev, toY: parseInt(e.target.value) || 0 }))}
                  min={0}
                  max={boardHeight - 1}
                  className="w-16 p-1 border border-gray-300 rounded text-sm"
                  disabled={areaSelectionActive}
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-yellow-800 mb-1">
              Reset Reason (required)
            </label>
            <textarea
              value={resetReason}
              onChange={(e) => setResetReason(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md text-sm"
              rows={2}
              placeholder="Explain why this area needs to be reset..."
              maxLength={200}
              disabled={areaSelectionActive}
            />
            <p className="text-xs text-gray-500 mt-1">
              {resetReason.length}/200 characters
            </p>
          </div>
          <div className="bg-white border border-yellow-200 rounded p-2">
            <p className="text-xs text-yellow-700">
              Reset area: {Math.abs(resetArea.toX - resetArea.fromX + 1)} × {Math.abs(resetArea.toY - resetArea.fromY + 1)} = {Math.abs((resetArea.toX - resetArea.fromX + 1) * (resetArea.toY - resetArea.fromY + 1))} pixels
              {Math.abs((resetArea.toX - resetArea.fromX + 1) * (resetArea.toY - resetArea.fromY + 1)) > 10000 && (
                <span className="text-red-600 block">⚠️ Exceeds 10,000 pixel limit</span>
              )}
            </p>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowResetForm(false)
                setError('')
                setMode(null)
                onRequestAreaSelection(false)
                setAreaClicks([])
                clearAreaSelection() // Clear highlight on cancel
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCanvasReset}
              disabled={isResetting || !resetReason.trim()}
              className="flex-1"
            >
              {isResetting ? 'Resetting...' : 'Reset Area'}
            </Button>
          </div>
        </div>
      )}

      {/* Report Form */}
      {showReportForm && (
        <div className="space-y-4">
          <div className="flex gap-2 mb-2">
            <Button
              variant={areaSelectionActive ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => {
                onRequestAreaSelection(!areaSelectionActive)
                setAreaClicks([])
              }}
              className="border-red-300 text-red-700"
            >
              {areaSelectionActive ? 'Cancel Area Selection' : 'Select Area on Canvas'}
            </Button>
            {areaSelectionActive && (
              <span className="text-xs text-red-700 self-center">Click two pixels on the canvas to select area to report</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-red-700 mb-1">
                From Position
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="X"
                  value={reportArea?.fromX ?? ''}
                  onChange={(e) => setReportArea(prev => prev ? { ...prev, fromX: parseInt(e.target.value) || 0 } : null)}
                  min={0}
                  max={boardWidth - 1}
                  className="w-16 p-1 border border-gray-300 rounded text-sm"
                  disabled={areaSelectionActive}
                />
                <input
                  type="number"
                  placeholder="Y"
                  value={reportArea?.fromY ?? ''}
                  onChange={(e) => setReportArea(prev => prev ? { ...prev, fromY: parseInt(e.target.value) || 0 } : null)}
                  min={0}
                  max={boardHeight - 1}
                  className="w-16 p-1 border border-gray-300 rounded text-sm"
                  disabled={areaSelectionActive}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-red-700 mb-1">
                To Position
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="X"
                  value={reportArea?.toX ?? ''}
                  onChange={(e) => setReportArea(prev => prev ? { ...prev, toX: parseInt(e.target.value) || 0 } : null)}
                  min={0}
                  max={boardWidth - 1}
                  className="w-16 p-1 border border-gray-300 rounded text-sm"
                  disabled={areaSelectionActive}
                />
                <input
                  type="number"
                  placeholder="Y"
                  value={reportArea?.toY ?? ''}
                  onChange={(e) => setReportArea(prev => prev ? { ...prev, toY: parseInt(e.target.value) || 0 } : null)}
                  min={0}
                  max={boardHeight - 1}
                  className="w-16 p-1 border border-gray-300 rounded text-sm"
                  disabled={areaSelectionActive}
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-red-700 mb-1">
              Report Reason (required)
            </label>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md text-sm"
              rows={2}
              placeholder="Explain why this area needs to be reported..."
              maxLength={200}
              disabled={areaSelectionActive}
            />
            <p className="text-xs text-gray-500 mt-1">
              {reportReason.length}/200 characters
            </p>
          </div>
          <div className="bg-white border border-red-200 rounded p-2">
            <p className="text-xs text-red-700">
              Report area: {reportArea ? Math.abs(reportArea.toX - reportArea.fromX + 1) : 0} × {reportArea ? Math.abs(reportArea.toY - reportArea.fromY + 1) : 0} = {reportArea ? Math.abs((reportArea.toX - reportArea.fromX + 1) * (reportArea.toY - reportArea.fromY + 1)) : 0} pixels
              {reportArea && Math.abs((reportArea.toX - reportArea.fromX + 1) * (reportArea.toY - reportArea.fromY + 1)) > 10000 && (
                <span className="text-red-600 block">⚠️ Exceeds 10,000 pixel limit</span>
              )}
            </p>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowReportForm(false)
                setError('')
                setMode(null)
                onRequestAreaSelection(false)
                setAreaClicks([])
                clearAreaSelection() // Clear highlight on cancel
                setReportArea(null)
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleAreaReport}
              disabled={isReporting || !reportArea || !reportReason.trim()}
              className="flex-1"
            >
              {isReporting ? 'Reporting...' : 'Report Area'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
} 