'use client'

import React, { useState, useEffect } from 'react'
import { LeaderboardEntry } from '@/types'
import { formatCredits } from '@/lib/utils'

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchLeaderboard()
  }, [])

  const fetchLeaderboard = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/leaderboard')
      const result = await response.json()

      if (result.success) {
        setLeaderboard(result.data)
      } else {
        setError(result.error || 'Failed to fetch leaderboard')
      }
    } catch (err) {
      setError('Failed to load leaderboard')
      console.error('Leaderboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatWalletAddress = (address: string) => {
    return address.length > 20 
      ? `${address.slice(0, 12)}...${address.slice(-8)}`
      : address
  }

  const formatDate = (date: Date | null) => {
    if (!date) return 'Never'
    return new Date(date).toLocaleDateString()
  }

  const getRankEmoji = (rank: number) => {
    switch (rank) {
      case 1: return '🥇'
      case 2: return '🥈'  
      case 3: return '🥉'
      default: return `#${rank}`
    }
  }

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1: return 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-white'
      case 2: return 'bg-gradient-to-r from-gray-300 to-gray-500 text-white'
      case 3: return 'bg-gradient-to-r from-amber-600 to-amber-800 text-white'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mx-auto mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-96 mx-auto"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <div className="text-6xl mb-4">😢</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Oops!</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchLeaderboard}
            className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Pixel Artists Leaderboard</h1>
        <p className="text-lg text-gray-600">Top Doge Draw contributors ranked by pixels painted</p>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-3xl font-bold text-yellow-600 mb-2">
            {leaderboard.length}
          </div>
          <div className="text-gray-600">Active Artists</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-3xl font-bold text-blue-600 mb-2">
            {leaderboard.reduce((sum, user) => sum + user.totalPixelsPainted, 0).toLocaleString()}
          </div>
          <div className="text-gray-600">Total Pixels Painted</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-3xl font-bold text-green-600 mb-2">
            {formatCredits(leaderboard.reduce((sum, user) => sum + user.totalCreditsSpent, 0))}
          </div>
          <div className="text-gray-600">Total Credits Spent</div>
        </div>
      </div>

      {/* Leaderboard Table */}
             {leaderboard.length === 0 ? (
         <div className="text-center py-12 bg-white rounded-lg shadow">
           <h3 className="text-lg font-medium text-gray-900 mb-2">No artists yet!</h3>
           <p className="text-gray-600">Be the first to paint some pixels and claim the top spot!</p>
         </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Doge Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pixels Painted
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Credits Spent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg. Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pixels Owned
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Activity
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leaderboard.map((user) => (
                  <tr 
                    key={user.id} 
                    className={`hover:bg-gray-50 ${user.rank <= 3 ? 'bg-gradient-to-r from-yellow-50 to-transparent' : ''}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getRankStyle(user.rank)}`}>
                        {getRankEmoji(user.rank)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-900 font-mono">
                            {formatWalletAddress(user.walletAddress)}
                          </div>
                          <div className="flex items-center space-x-2">
                            {user.isAdmin && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                Admin
                              </span>
                            )}
                            <span className="text-xs text-gray-500">
                              Joined {formatDate(user.joinedAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-blue-600">
                        {user.totalPixelsPainted.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-green-600">
                        {formatCredits(user.totalCreditsSpent)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
                        {formatCredits(user.averagePixelCost)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-purple-600 font-medium">
                        {user.uniquePixelsOwned}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
                        {formatDate(user.lastPaintAt)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fun Facts */}
      {leaderboard.length > 0 && (
        <div className="mt-8 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-6 border border-yellow-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Fun Facts</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Most Prolific Artist:</span>{' '}
              <span className="text-blue-600 font-mono">
                {formatWalletAddress(leaderboard[0]?.walletAddress || '')} 
              </span>{' '}
              with {leaderboard[0]?.totalPixelsPainted.toLocaleString()} pixels!
            </div>
            <div>
              <span className="font-medium">Biggest Spender:</span>{' '}
              <span className="text-green-600">
                {formatCredits(Math.max(...leaderboard.map(u => u.totalCreditsSpent)))} credits
              </span>
            </div>
            <div>
              <span className="font-medium">Most Expensive Pixel:</span>{' '}
              <span className="text-red-600">
                {formatCredits(Math.max(...leaderboard.map(u => u.averagePixelCost)))} credits average
              </span>
            </div>
            <div>
              <span className="font-medium">Pixel Ownership Leader:</span>{' '}
              <span className="text-purple-600">
                {Math.max(...leaderboard.map(u => u.uniquePixelsOwned))} pixels owned
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 