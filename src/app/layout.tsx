'use client'

import React from 'react'
import "./globals.css"
import { Header } from '@/components/layout/Header'
import { AuthProvider } from '@/providers/AuthProvider'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <AuthProvider>
          <Header />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  )
}
