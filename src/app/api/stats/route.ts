import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Get total number of active boards
    const totalBoards = await prisma.board.count({
      where: { isActive: true }
    })

    // Get total pixels painted across all boards
    const totalPixels = await prisma.pixel.count({
      where: { isHidden: false }
    })

    // Get unique active artists (users who have painted pixels)
    const activeArtists = await prisma.user.count({
      where: {
        changedPixels: {
          some: {
            isHidden: false
          }
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        collaborativeBoards: totalBoards,
        pixelsPainted: totalPixels,
        activeArtists: activeArtists
      }
    })

  } catch (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
} 