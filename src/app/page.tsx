"use client"

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'

interface Stats {
  collaborativeBoards: number
  pixelsPainted: number
  activeArtists: number
}

export default function Home() {
  const [stats, setStats] = useState<Stats>({
    collaborativeBoards: 0,
    pixelsPainted: 0,
    activeArtists: 0
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/stats')
        const result = await response.json()
        if (result.success) {
          setStats(result.data)
        }
      } catch (error) {
        console.error('Error fetching stats:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [])

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M'
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K'
    }
    return num.toLocaleString()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-50">
      {/* Hero Section */}
      <section 
        className="relative py-20 px-4 text-center bg-cover bg-center bg-no-repeat min-h-[500px] flex items-center"
        style={{
          backgroundImage: "url('/banner.jpg')",
        }}
      >
        {/* Light overlay only if image is very bright - adjust as needed */}
        
        {/* Content with backdrop blur */}
        <div className="relative z-10 max-w-4xl mx-auto">
          <div className="backdrop-blur-none bg-white/75 rounded-xl p-8 shadow-lg">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">
              Doge Draw
            </h1>
            <p className="text-xl text-gray-700 mb-8 max-w-2xl mx-auto">
              A collaborative pixel art platform where you spend Dogecoin-purchased credits 
              to paint pixels on shared canvases. Watch prices rise with each change!
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/boards">
                <Button variant="doge" size="lg" className="w-full sm:w-auto">
                  Start Drawing
                </Button>
              </Link>
              <Link href="/auth">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Sign Up
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-xl font-semibold mb-3">Buy Credits</h3>
              <p className="text-gray-600">
                Purchase credits with Dogecoin. 1 DOGE = 100 credits. 
                Credits are your paintbrush currency.
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">🎨</div>
              <h3 className="text-xl font-semibold mb-3">Paint Pixels</h3>
              <p className="text-gray-600">
                Choose colors and paint pixels on collaborative canvases. 
                Each pixel has a price that increases when changed.
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">📈</div>
              <h3 className="text-xl font-semibold mb-3">Dynamic Pricing</h3>
              <p className="text-gray-600">
                Pixel prices multiply by 1.2x each time they're painted, 
                creating a competitive art economy.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-12">
            Join the Community
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-6xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent mb-2">
                {isLoading ? '...' : formatNumber(stats.collaborativeBoards)}
              </div>
              <p className="text-gray-600 text-lg font-medium">Collaborative Boards</p>
            </div>
            <div className="text-center">
              <div className="text-6xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent mb-2">
                {isLoading ? '...' : formatNumber(stats.pixelsPainted)}
              </div>
              <p className="text-gray-600 text-lg font-medium">Pixels Painted</p>
            </div>
            <div className="text-center">
              <div className="text-6xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent mb-2">
                {isLoading ? '...' : formatNumber(stats.activeArtists)}
              </div>
              <p className="text-gray-600 text-lg font-medium">Active Artists</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features List */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Doge Draw Features
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="text-yellow-600 text-xl">✓</div>
                <div>
                  <h4 className="font-semibold">Real-time Collaboration</h4>
                  <p className="text-gray-600 text-sm">See other artists paint in real-time with WebSocket updates</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="text-yellow-600 text-xl">✓</div>
                <div>
                  <h4 className="font-semibold">Multiple Boards</h4>
                  <p className="text-gray-600 text-sm">Different canvases with configurable sizes and pricing</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="text-yellow-600 text-xl">✓</div>
                <div>
                  <h4 className="font-semibold">Content Moderation</h4>
                  <p className="text-gray-600 text-sm">Community reporting system to hide inappropriate content</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="text-yellow-600 text-xl">✓</div>
                <div>
                  <h4 className="font-semibold">Password Recovery</h4>
                  <p className="text-gray-600 text-sm">Recover your account by sending 0.69420 DOGE</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="text-yellow-600 text-xl">✓</div>
                <div>
                  <h4 className="font-semibold">Time-lapse Export</h4>
                  <p className="text-gray-600 text-sm">Export board history as animated GIFs</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="text-yellow-600 text-xl">✓</div>
                <div>
                  <h4 className="font-semibold">Archived Boards</h4>
                  <p className="text-gray-600 text-sm">Frozen boards remain viewable as permanent art</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">
            Ready to Start Creating?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Join thousands of artists creating collaborative pixel art on the blockchain
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                Create Account
              </Button>
            </Link>
            <Link href="/boards">
              <Button variant="outline" size="lg" className="w-full sm:w-auto bg-transparent text-white border-white hover:bg-white hover:text-yellow-600">
                View Boards
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
