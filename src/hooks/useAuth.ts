'use client'

import { useState, useEffect } from 'react'
import { AuthUser } from '@/types'

export function useAuthState() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const login = async (walletAddress: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress, password })
      })

      const result = await response.json()
      
      if (result.success && result.data.user) {
        setUser(result.data.user)
        localStorage.setItem('auth_token', result.data.token)
        return true
      }
      
      return false
    } catch (error) {
      console.error('Login error:', error)
      return false
    }
  }

  const register = async (walletAddress: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress, password })
      })

      const result = await response.json()
      
      if (result.success) {
        // Auto-login after successful registration
        return await login(walletAddress, password)
      }
      
      return false
    } catch (error) {
      console.error('Registration error:', error)
      return false
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('auth_token')
  }

  const refreshUser = async () => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const result = await response.json()
      
      if (result.success && result.data) {
        setUser(result.data)
      } else {
        localStorage.removeItem('auth_token')
      }
    } catch (error) {
      console.error('Auth refresh error:', error)
      localStorage.removeItem('auth_token')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refreshUser()
  }, [])

  return {
    user,
    login,
    register,
    logout,
    refreshUser,
    isLoading
  }
} 