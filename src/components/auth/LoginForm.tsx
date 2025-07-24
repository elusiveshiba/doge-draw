'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/providers/AuthProvider'
import { isValidDogeAddress } from '@/lib/utils'

interface LoginFormProps {
  onSuccess?: () => void
  onSwitchToRegister?: () => void
}

export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const { login } = useAuth()
  const [walletAddress, setWalletAddress] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    if (!walletAddress || !password) {
      setError('Please fill in all fields')
      setIsLoading(false)
      return
    }

    // Remove Dogecoin address validation
    // if (!isValidDogeAddress(walletAddress)) {
    //   setError('Please enter a valid Dogecoin wallet address')
    //   setIsLoading(false)
    //   return
    // }

    try {
      const success = await login(walletAddress, password)
      if (success) {
        onSuccess?.()
      } else {
        setError('Invalid wallet address or password')
      }
    } catch (err) {
      setError('Login failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Welcome Back</h2>
          <p className="text-gray-600 mt-2">Sign in to your Doge Draw account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="walletAddress" className="block text-sm font-medium text-gray-700 mb-1">
              Dogecoin address or username
            </label>
            <input
              id="walletAddress"
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              placeholder="Enter your Dogecoin address or username"
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              placeholder="Enter your password"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <Button
            type="submit"
            variant="doge"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Don't have an account?{' '}
            <button
              onClick={onSwitchToRegister}
              className="text-yellow-600 hover:text-yellow-700 font-medium"
            >
              Create one
            </button>
          </p>
        </div>

        <div className="mt-4 text-center">
          <button className="text-sm text-gray-500 hover:text-gray-600">
            Forgot password? (Send 0.69420 DOGE to recover)
          </button>
        </div>
      </div>
    </div>
  )
} 