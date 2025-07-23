'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import { Button } from '@/components/ui/button'
import { formatCredits } from '@/lib/utils'
import { ModerationPanel } from '@/components/admin/ModerationPanel'

interface User {
  id: string
  walletAddress: string
  credits: number
  isAdmin: boolean
  createdAt: string
  _count: {
    pixelHistory: number
    changedPixels: number
    reports: number
    transactions: number
  }
  isTrusted: boolean
}

export default function AdminPage() {
  const { user, isLoading: authLoading, refreshUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setLoading] = useState(true)
  const [creditsLoading, setCreditsLoading] = useState<string | null>(null)
  const [trustLoading, setTrustLoading] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'users' | 'moderation'>('users')

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }

      const data = await response.json()
      setUsers(data.users)
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddCredits = async (userId: string) => {
    setCreditsLoading(userId)
    
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/admin/add-credits', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId, amount: 1000 })
      })

      const result = await response.json()
      
      if (result.success) {
        // Update the user's credits in the local state
        setUsers(prev => prev.map(u => 
          u.id === userId 
            ? { ...u, credits: u.credits + 1000 }
            : u
        ))
        if (userId === user?.id) {
          await refreshUser()
        }
      } else {
        console.error('Failed to add credits:', result.error)
        alert('Failed to add credits: ' + result.error)
      }
    } catch (error) {
      console.error('Error adding credits:', error)
      alert('Error adding credits')
    } finally {
      setCreditsLoading(null)
    }
  }

  const handleTrustUser = async (userId: string) => {
    setTrustLoading(userId)
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/moderation/trusted-users', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId, reason: 'Manual admin trust from dashboard' })
      })
      const result = await response.json()
      if (result.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, isTrusted: true } : u))
        alert('User promoted to trusted status')
      } else {
        alert('Failed to trust user: ' + (result.error || 'Unknown error'))
      }
    } catch (error) {
      alert('Error trusting user')
    } finally {
      setTrustLoading(null)
    }
  }

  useEffect(() => {
    if (!user?.isAdmin || authLoading) return
    fetchUsers()
    const interval = setInterval(fetchUsers, 5000)
    return () => clearInterval(interval)
  }, [authLoading, user?.isAdmin])

  if (authLoading || isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  if (!user?.isAdmin) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">You need admin permissions to access this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">Manage users, credits, and moderation</p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'users'
                ? 'border-doge-orange text-doge-orange'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            User Management
          </button>
          <button
            onClick={() => setActiveTab('moderation')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'moderation'
                ? 'border-doge-orange text-doge-orange'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Moderation
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'users' && (
        <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              All Users ({users.length})
            </h2>
          </div>

        {users.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No users found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Wallet Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Credits
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Activity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((userData) => (
                  <tr key={userData.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <div className="font-mono text-gray-900">
                          {userData.walletAddress.slice(0, 8)}...{userData.walletAddress.slice(-6)}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">
                          {userData.walletAddress}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCredits(userData.credits)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="text-xs text-gray-500 space-y-1">
                        <div>{userData._count.pixelHistory} pixels painted</div>
                        <div>{userData._count.changedPixels} pixels owned</div>
                        <div>{userData._count.transactions} transactions</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {userData.isAdmin ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          User
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(userData.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddCredits(userData.id)}
                        disabled={creditsLoading === userData.id}
                        className="border-green-500 text-green-600 hover:bg-green-50"
                      >
                        {creditsLoading === userData.id ? 'Adding...' : '+1000 Credits'}
                      </Button>
                      <Button
                        variant="doge"
                        size="sm"
                        onClick={() => handleTrustUser(userData.id)}
                        disabled={trustLoading === userData.id || userData.isAdmin || userData.isTrusted}
                        className="ml-2 border-yellow-500 text-yellow-700 hover:bg-yellow-50"
                      >
                        {trustLoading === userData.id ? 'Trusting...' : (userData.isTrusted ? 'Trusted' : 'Trust')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      )}

      {activeTab === 'moderation' && (
        <ModerationPanel />
      )}
    </div>
  )
} 