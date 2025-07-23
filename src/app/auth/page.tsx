'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LoginForm } from '@/components/auth/LoginForm'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { useAuth } from '@/providers/AuthProvider'

export default function AuthPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoading } = useAuth()
  
  const [isRegister, setIsRegister] = useState(searchParams.get('register') === 'true')

  // Update form mode when URL params change
  useEffect(() => {
    setIsRegister(searchParams.get('register') === 'true')
  }, [searchParams])

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && user) {
      router.push('/boards')
    }
  }, [user, isLoading, router])

  const handleSuccess = () => {
    router.push('/boards')
  }

  const switchMode = () => {
    setIsRegister(!isRegister)
    // Update URL without triggering navigation
    const newUrl = isRegister ? '/auth' : '/auth?register=true'
    window.history.replaceState({}, '', newUrl)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-yellow-500"></div>
      </div>
    )
  }

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Redirecting to boards...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        {isRegister ? (
          <RegisterForm
            onSuccess={handleSuccess}
            onSwitchToLogin={switchMode}
          />
        ) : (
          <LoginForm
            onSuccess={handleSuccess}
            onSwitchToRegister={switchMode}
          />
        )}
      </div>
    </div>
  )
} 