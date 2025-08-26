'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/providers/AuthProvider'
import { formatCredits } from '@/lib/utils'

export function Header() {
  const { user, logout, isLoading, refreshUser } = useAuth()
  const [copied, setCopied] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [addingCredits, setAddingCredits] = useState(false)


  const handleLogout = () => {
    logout()
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000) // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy: ', err)
    }
  }

  const handleAddCredits = async () => {
    if (!user) return
    
    setAddingCredits(true)
    
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/dev/add-credits', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()
      
      if (result.success) {
        await refreshUser() // Refresh user data to show new credits
        alert(`Successfully added 1000 credits! New balance: ${formatCredits(result.data.newCredits)}`)
      } else {
        if (result.error === 'Development endpoint not available in production') {
          alert('Credit purchases are not available in production. This is a development feature.')
        } else {
          console.error('Failed to add credits:', result.error)
          alert('Failed to add credits: ' + result.error)
        }
      }
    } catch (error) {
      console.error('Error adding credits:', error)
      alert('Error adding credits. Please try again.')
    } finally {
      setAddingCredits(false)
    }
  }

  const isDevelopment = process.env.NODE_ENV === 'development'

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-xl font-bold text-gray-900">Doge Draw</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <Link href="/boards" className="text-gray-700 hover:text-blue-600 font-medium">
              Boards
            </Link>
            <Link href="/leaderboard" className="text-gray-700 hover:text-blue-600 font-medium">
              Leaderboard
            </Link>
            {user?.isAdmin && (
              <Link href="/admin" className="text-gray-700 hover:text-blue-600 font-medium">
                Admin
              </Link>
            )}
          </nav>

          {/* User Info / Auth */}
          <div className="flex items-center space-x-4">
            {isLoading ? (
              <div className="animate-pulse">
                <div className="h-8 w-20 bg-gray-200 rounded"></div>
              </div>
            ) : user ? (
              <div className="flex items-center space-x-4">
                {/* Credits Display */}
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">Credits:</span>
                  <span className="font-semibold text-yellow-600">
                    {formatCredits(user.credits)}
                  </span>
                </div>

                {/* User Menu */}
                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <button
                      className="text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 px-2 py-1 rounded font-mono cursor-pointer transition-colors duration-200"
                      onClick={() => copyToClipboard(user.walletAddress)}
                      onMouseEnter={() => setShowTooltip(true)}
                      onMouseLeave={() => setShowTooltip(false)}
                      title="Click to copy full address"
                    >
                      {user.walletAddress.length > 20 
                        ? `${user.walletAddress.slice(0, 8)}...${user.walletAddress.slice(-6)}`
                        : user.walletAddress}
                    </button>
                    
                    {/* Tooltip */}
                    {showTooltip && (
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50 whitespace-nowrap font-mono">
                        {user.walletAddress}
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900"></div>
                      </div>
                    )}
                    
                    {/* Copy feedback */}
                    {copied && (
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 bg-green-600 text-white text-xs rounded shadow-lg z-50 whitespace-nowrap">
                        Copied!
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-green-600"></div>
                      </div>
                    )}
                  </div>
                  
                  {user.isAdmin && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      Admin
                    </span>
                  )}
                </div>

                {/* Buy Credits Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddCredits}
                  disabled={addingCredits}
                >
                  {addingCredits ? 'Adding...' : 'Add Credits'}
                </Button>

                {/* Logout Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                >
                  Logout
                </Button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link href="/auth">
                  <Button variant="outline" size="sm">
                    Sign In
                  </Button>
                </Link>
                <Link href="/auth?register=true">
                  <Button variant="doge" size="sm">
                    Join Now
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden border-t bg-gray-50">
        <div className="px-4 py-2 space-y-1">
          <Link href="/boards" className="block px-3 py-2 text-gray-600 hover:text-gray-900">
            Boards
          </Link>
          <Link href="/leaderboard" className="block px-3 py-2 text-gray-600 hover:text-gray-900">
            Leaderboard
          </Link>
          {user?.isAdmin && (
            <Link href="/admin" className="block px-3 py-2 text-gray-600 hover:text-gray-900">
              Admin
            </Link>
          )}
        </div>
      </div>
    </header>
  )
} 