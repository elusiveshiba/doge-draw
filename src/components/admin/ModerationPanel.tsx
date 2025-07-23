'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/providers/AuthProvider'

interface Report {
  id: string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt: string
  pixel: {
    x: number
    y: number
    color: string
    board: {
      name: string
    }
  }
  reporter: {
    walletAddress: string
  }
}

interface PendingUser {
  id: string
  walletAddress: string
  credits: number
  createdAt: string
  lastReportedAt?: string
  eligibleForTrusted: boolean
}

export function ModerationPanel() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'reports' | 'users'>('reports')
  const [reports, setReports] = useState<Report[]>([])
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Only show for admins
  if (!user?.isAdmin) {
    return null
  }

  useEffect(() => {
    fetchData()
  }, [activeTab])

  const fetchData = async () => {
    setLoading(true)
    setError('')

    try {
      const token = localStorage.getItem('auth_token')
      
      if (activeTab === 'reports') {
        const response = await fetch('/api/moderation/reports', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await response.json()
        
        if (data.success) {
          setReports(data.reports)
        } else {
          setError(data.error || 'Failed to fetch reports')
        }
      } else {
        const response = await fetch('/api/moderation/trusted-users', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await response.json()
        
        if (data.success) {
          setPendingUsers(data.eligibleUsers)
        } else {
          setError(data.error || 'Failed to fetch users')
        }
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleReportReview = async (reportId: string, approved: boolean, notes?: string) => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`/api/moderation/reports/${reportId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          approved,
          moderatorNotes: notes
        })
      })

      const data = await response.json()
      
      if (data.success) {
        fetchData() // Refresh data
        alert(`Report ${approved ? 'approved' : 'rejected'} successfully`)
      } else {
        alert(data.error || 'Failed to process report')
      }
    } catch (err) {
      alert('Network error')
    }
  }

  const handleTrustedUserPromotion = async (userId: string, promote: boolean) => {
    try {
      const token = localStorage.getItem('auth_token')
      const endpoint = promote ? '/api/moderation/trusted-users' : `/api/moderation/trusted-users/${userId}`
      const method = promote ? 'POST' : 'DELETE'
      
      const body = promote ? {
        userId,
        reason: 'Manual admin promotion - meets eligibility criteria'
      } : undefined

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        ...(body && { body: JSON.stringify(body) })
      })

      const data = await response.json()
      
      if (data.success) {
        fetchData() // Refresh data
        alert(`User ${promote ? 'promoted to' : 'removed from'} trusted status`)
      } else {
        alert(data.error || 'Failed to update user status')
      }
    } catch (err) {
      alert('Network error')
    }
  }

  const runAutoPromotion = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/moderation/auto-promote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()
      
      if (data.success) {
        alert(`Auto-promotion completed. ${data.promotedCount} users promoted.`)
        fetchData() // Refresh data
      } else {
        alert(data.error || 'Failed to run auto-promotion')
      }
    } catch (err) {
      alert('Network error')
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Moderation Panel</h2>
        <div className="flex gap-2">
          <Button
            variant={activeTab === 'reports' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('reports')}
          >
            Pending Reports
          </Button>
          <Button
            variant={activeTab === 'users' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('users')}
          >
            Trusted Users
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="text-gray-500">Loading...</div>
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <div className="text-red-600">{error}</div>
          <Button variant="outline" size="sm" onClick={fetchData} className="mt-2">
            Retry
          </Button>
        </div>
      ) : (
        <>
          {activeTab === 'reports' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Pending Reports ({reports.length})</h3>
              </div>
              
              {reports.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No pending reports
                </div>
              ) : (
                <div className="space-y-3">
                  {reports.map((report) => (
                    <div key={report.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div 
                              className="w-6 h-6 border border-gray-300 rounded"
                              style={{ backgroundColor: report.pixel.color }}
                            ></div>
                            <div className="text-sm">
                              <strong>Pixel ({report.pixel.x}, {report.pixel.y})</strong> in {report.pixel.board.name}
                            </div>
                          </div>
                          <div className="text-sm text-gray-600 mb-2">
                            <strong>Reason:</strong> {report.reason}
                          </div>
                          <div className="text-xs text-gray-500">
                            Reported by {report.reporter.walletAddress} on {new Date(report.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleReportReview(report.id, true)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReportReview(report.id, false)}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Trusted User Management</h3>
                <Button
                  variant="doge"
                  size="sm"
                  onClick={runAutoPromotion}
                >
                  Run Auto-Promotion
                </Button>
              </div>
              
              {pendingUsers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No users eligible for trusted status
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingUsers.map((pendingUser) => (
                    <div key={pendingUser.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-sm font-medium">{pendingUser.walletAddress}</div>
                          <div className="text-xs text-gray-500 space-x-4">
                            <span>Credits: {pendingUser.credits}</span>
                            <span>Joined: {new Date(pendingUser.createdAt).toLocaleDateString()}</span>
                            {pendingUser.lastReportedAt && (
                              <span>Last reported: {new Date(pendingUser.lastReportedAt).toLocaleDateString()}</span>
                            )}
                          </div>
                          {pendingUser.eligibleForTrusted && (
                            <div className="text-xs text-green-600 font-medium mt-1">
                              ✓ Eligible for trusted status (1+ weeks without reports)
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleTrustedUserPromotion(pendingUser.id, true)}
                            disabled={!pendingUser.eligibleForTrusted}
                          >
                            Promote
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
} 