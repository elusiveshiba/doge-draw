import { NextRequest, NextResponse } from 'next/server'
import { autoPromoteEligibleUsers } from '@/lib/moderation'

// Auto-promote eligible users (for cron job)
export async function POST(request: NextRequest) {
  try {
    // Verify this is called from a cron job or with proper authorization
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({
        error: 'Unauthorized'
      }, { status: 401 })
    }

    const promotedUsers = await autoPromoteEligibleUsers()

    return NextResponse.json({
      success: true,
      promotedCount: promotedUsers.length,
      promotedUsers
    })
  } catch (error) {
    console.error('Error in auto-promotion:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}

// Get auto-promotion status (admin only)
export async function GET() {
  try {
    // This could return stats about auto-promotion eligibility
    return NextResponse.json({
      message: 'Auto-promotion endpoint available',
      info: 'POST to this endpoint with proper cron authorization to run auto-promotion'
    })
  } catch (error) {
    console.error('Error in auto-promotion status:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
} 