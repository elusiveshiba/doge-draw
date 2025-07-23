import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || 'fallback-secret')

async function verifyAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  try {
    const token = authHeader.substring(7)
    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as string
    const user = await prisma.user.findUnique({ where: { id: userId } })
    return user
  } catch {
    return null
  }
}

const patchSchema = z.object({
  startingCredits: z.number().int().min(0).optional()
})

export async function GET(request: NextRequest) {
  // Only admins
  const user = await verifyAuth(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const adminAddresses = process.env.ADMIN_WALLET_ADDRESSES?.split(',').map(addr => addr.trim()) || []
  const isAdmin = adminAddresses.includes(user.walletAddress)
  if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  // Fetch all settings
  const settings = await prisma.settings.findMany()
  return NextResponse.json({
    settings: settings.map((s: { key: string; value: string }) => ({ key: s.key, value: s.value }))
  })
}

export async function PATCH(request: NextRequest) {
  // Only admins
  const user = await verifyAuth(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const adminAddresses = process.env.ADMIN_WALLET_ADDRESSES?.split(',').map(addr => addr.trim()) || []
  const isAdmin = adminAddresses.includes(user.walletAddress)
  if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await request.json()
  const { startingCredits } = patchSchema.parse(body)
  let updated = []
  if (typeof startingCredits === 'number') {
    const updatedSetting = await prisma.settings.upsert({
      where: { key: 'startingCredits' },
      update: { value: String(startingCredits) },
      create: { key: 'startingCredits', value: String(startingCredits) }
    })
    updated.push({ key: 'startingCredits', value: updatedSetting.value })
  }
  return NextResponse.json({ success: true, updated })
} 