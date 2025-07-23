import { prisma } from './prisma'
import { ModerationActionType, ReportStatus } from '@prisma/client'

// Constants for moderation rules
export const MODERATION_CONSTANTS = {
  MIN_CREDITS_TO_REPORT: 100,
  REPORTS_TO_AUTO_HIDE: 5,
  TRUSTED_USER_PROMOTION_DAYS: 7, // 1 week without reports
  MAX_CANVAS_RESET_SIZE: 100 * 100, // Maximum pixels that can be reset at once
} as const

// Check if user is eligible for trusted status
export async function checkTrustedUserEligibility(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      lastReportedAt: true,
      createdAt: true,
      isTrusted: true,
      isAdmin: true
    }
  })

  if (!user || user.isTrusted || user.isAdmin) return false

  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - MODERATION_CONSTANTS.TRUSTED_USER_PROMOTION_DAYS)

  // User must have been active for at least a week and not reported in the last week
  const hasBeenActiveForWeek = user.createdAt < oneWeekAgo
  const hasNoRecentReports = !user.lastReportedAt || user.lastReportedAt < oneWeekAgo

  return hasBeenActiveForWeek && hasNoRecentReports
}

// Auto-promote eligible users to trusted status
export async function autoPromoteEligibleUsers(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      isTrusted: false,
      isAdmin: false
    },
    select: {
      id: true,
      walletAddress: true,
      lastReportedAt: true,
      createdAt: true
    }
  })

  const promotedUsers: string[] = []

  for (const user of users) {
    if (await checkTrustedUserEligibility(user.id)) {
      await promoteUserToTrusted(user.id, 'AUTO_PROMOTION')
      promotedUsers.push(user.walletAddress)
    }
  }

  return promotedUsers
}

// Manually promote user to trusted status
export async function promoteUserToTrusted(
  userId: string, 
  promotedBy: string, 
  reason: string = 'Manual approval'
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Update user status
    await tx.user.update({
      where: { id: userId },
      data: {
        isTrusted: true,
        trustedAt: new Date(),
        trustedBy: promotedBy === 'AUTO_PROMOTION' ? null : promotedBy
      }
    })

    // Log moderation action
    await tx.moderationAction.create({
      data: {
        actionType: ModerationActionType.TRUST_USER,
        reason,
        moderatorId: promotedBy === 'AUTO_PROMOTION' ? userId : promotedBy, // Self for auto, admin for manual
        targetUserId: userId
      }
    })
  })
}

// Remove trusted status
export async function removeTrustedStatus(
  userId: string, 
  moderatorId: string, 
  reason: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        isTrusted: false,
        trustedAt: null,
        trustedBy: null
      }
    })

    await tx.moderationAction.create({
      data: {
        actionType: ModerationActionType.UNTRUST_USER,
        reason,
        moderatorId,
        targetUserId: userId
      }
    })
  })
}

// Check if pixel should be auto-hidden based on reports
export async function checkPixelReportStatus(pixelId: string): Promise<{
  shouldHide: boolean
  reportCount: number
}> {
  const reportCount = await prisma.report.count({
    where: { 
      pixelId,
      status: ReportStatus.PENDING
    }
  })

  return {
    shouldHide: reportCount >= MODERATION_CONSTANTS.REPORTS_TO_AUTO_HIDE,
    reportCount
  }
}

// Handle pixel report submission
export async function submitPixelReport(
  pixelId: string,
  reporterId: string,
  reason: string
): Promise<{
  success: boolean
  reportId?: string
  pixelHidden?: boolean
  error?: string
}> {
  try {
    // Check if user has sufficient credits
    const reporter = await prisma.user.findUnique({
      where: { id: reporterId },
      select: { credits: true }
    })

    if (!reporter || reporter.credits < MODERATION_CONSTANTS.MIN_CREDITS_TO_REPORT) {
      return {
        success: false,
        error: `Need at least ${MODERATION_CONSTANTS.MIN_CREDITS_TO_REPORT} credits to report pixels`
      }
    }

    // Check if user already reported this pixel
    const existingReport = await prisma.report.findUnique({
      where: {
        pixelId_reporterId: {
          pixelId,
          reporterId
        }
      }
    })

    if (existingReport) {
      return {
        success: false,
        error: 'You have already reported this pixel'
      }
    }

    // Submit report and check if pixel should be hidden
    const result = await prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          pixelId,
          reporterId,
          reason,
          status: ReportStatus.PENDING
        }
      })

      const { shouldHide, reportCount } = await checkPixelReportStatus(pixelId)
      let pixelHidden = false

      if (shouldHide) {
        await tx.pixel.update({
          where: { id: pixelId },
          data: { isHidden: true }
        })

        // Auto-approve all reports for this pixel
        await tx.report.updateMany({
          where: { pixelId },
          data: {
            status: ReportStatus.AUTO_HIDDEN,
            reviewedAt: new Date()
          }
        })

        // Update last reported time for pixel owner
        const pixel = await tx.pixel.findUnique({
          where: { id: pixelId },
          select: { lastChangedById: true }
        })

        if (pixel?.lastChangedById) {
          await tx.user.update({
            where: { id: pixel.lastChangedById },
            data: { lastReportedAt: new Date() }
          })
        }

        pixelHidden = true
      }

      return { reportId: report.id, pixelHidden, reportCount }
    })

    return {
      success: true,
      ...result
    }
  } catch (error) {
    console.error('Error submitting pixel report:', error)
    return {
      success: false,
      error: 'Failed to submit report'
    }
  }
}

// Reset canvas section (trusted users only)
export async function resetCanvasSection(
  moderatorId: string,
  boardId: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  reason: string
): Promise<{
  success: boolean
  affectedPixels?: number
  error?: string
}> {
  try {
    // Verify moderator permissions
    const moderator = await prisma.user.findUnique({
      where: { id: moderatorId },
      select: { isTrusted: true, isAdmin: true }
    })

    if (!moderator || (!moderator.isTrusted && !moderator.isAdmin)) {
      return {
        success: false,
        error: 'Insufficient permissions for canvas reset'
      }
    }

    // Validate reset area size
    const width = Math.abs(toX - fromX) + 1
    const height = Math.abs(toY - fromY) + 1
    const totalPixels = width * height

    if (totalPixels > MODERATION_CONSTANTS.MAX_CANVAS_RESET_SIZE) {
      return {
        success: false,
        error: `Reset area too large. Maximum ${MODERATION_CONSTANTS.MAX_CANVAS_RESET_SIZE} pixels allowed`
      }
    }

    // Perform canvas reset
    const result = await prisma.$transaction(async (tx) => {
      // Delete pixels in the specified area
      const deleteResult = await tx.pixel.deleteMany({
        where: {
          boardId,
          x: {
            gte: Math.min(fromX, toX),
            lte: Math.max(fromX, toX)
          },
          y: {
            gte: Math.min(fromY, toY),
            lte: Math.max(fromY, toY)
          }
        }
      })

      // Log moderation action
      await tx.moderationAction.create({
        data: {
          actionType: ModerationActionType.CANVAS_RESET,
          reason,
          moderatorId,
          boardId,
          fromX: Math.min(fromX, toX),
          fromY: Math.min(fromY, toY),
          toX: Math.max(fromX, toX),
          toY: Math.max(fromY, toY),
          affectedPixels: deleteResult.count
        }
      })

      return { affectedPixels: deleteResult.count }
    })

    return {
      success: true,
      affectedPixels: result.affectedPixels
    }
  } catch (error) {
    console.error('Error resetting canvas section:', error)
    return {
      success: false,
      error: 'Failed to reset canvas section'
    }
  }
}

// Get moderation history for a user
export async function getUserModerationHistory(userId: string) {
  return await prisma.moderationAction.findMany({
    where: {
      OR: [
        { moderatorId: userId },
        { targetUserId: userId }
      ]
    },
    include: {
      moderator: {
        select: {
          walletAddress: true
        }
      },
      targetUser: {
        select: {
          walletAddress: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  })
}

// Get pending reports for admin review
export async function getPendingReports(limit: number = 50) {
  return await prisma.report.findMany({
    where: {
      status: ReportStatus.PENDING
    },
    include: {
      pixel: {
        include: {
          board: {
            select: {
              id: true,
              name: true
            }
          },
          lastChangedBy: {
            select: {
              walletAddress: true
            }
          }
        }
      },
      reporter: {
        select: {
          walletAddress: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: limit
  })
}

// Review a report (approve/reject)
export async function reviewReport(
  reportId: string,
  reviewerId: string,
  approved: boolean,
  moderatorNotes?: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    await prisma.$transaction(async (tx) => {
      const report = await tx.report.update({
        where: { id: reportId },
        data: {
          status: approved ? ReportStatus.APPROVED : ReportStatus.REJECTED,
          reviewedAt: new Date(),
          reviewedBy: reviewerId,
          moderatorNotes
        },
        include: {
          pixel: true
        }
      })

      // If approved, hide the pixel
      if (approved && !report.pixel.isHidden) {
        await tx.pixel.update({
          where: { id: report.pixelId },
          data: { isHidden: true }
        })

        // Update last reported time for pixel owner
        if (report.pixel.lastChangedById) {
          await tx.user.update({
            where: { id: report.pixel.lastChangedById },
            data: { lastReportedAt: new Date() }
          })
        }
      }

      // Log moderation action
      await tx.moderationAction.create({
        data: {
          actionType: approved ? ModerationActionType.HIDE_PIXEL : ModerationActionType.REVIEW_REPORT,
          reason: `Report ${approved ? 'approved' : 'rejected'}: ${moderatorNotes || 'No notes'}`,
          moderatorId: reviewerId
        }
      })
    })

    return { success: true }
  } catch (error) {
    console.error('Error reviewing report:', error)
    return {
      success: false,
      error: 'Failed to review report'
    }
  }
}

// Unhide a pixel
export async function unhidePixel(
  pixelId: string,
  moderatorId: string,
  reason: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.pixel.update({
        where: { id: pixelId },
        data: { isHidden: false }
      })

      await tx.moderationAction.create({
        data: {
          actionType: ModerationActionType.UNHIDE_PIXEL,
          reason,
          moderatorId
        }
      })
    })

    return { success: true }
  } catch (error) {
    console.error('Error unhiding pixel:', error)
    return {
      success: false,
      error: 'Failed to unhide pixel'
    }
  }
} 