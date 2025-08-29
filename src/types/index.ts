import { User, Board, Pixel, PixelHistory, Transaction, Report, ModerationAction } from '@prisma/client'

// Extended types with relations
export type BoardWithPixels = Board & {
  pixels: Pixel[]
}

export type PixelWithDetails = Pixel & {
  board: Board
  lastChangedBy?: User
  reports: Report[]
}

export type UserWithDetails = User & {
  transactions: Transaction[]
  reports: Report[]
  moderationActions: ModerationAction[]
}

export type UserWithTransactions = User & {
  transactions: Transaction[]
}

export type ReportWithDetails = Report & {
  pixel: PixelWithDetails
  reporter: Pick<User, 'walletAddress'>
}

export type ModerationActionWithDetails = ModerationAction & {
  moderator: Pick<User, 'walletAddress'>
  targetUser?: Pick<User, 'walletAddress'>
}

// Canvas types
export interface PixelData {
  x: number
  y: number
  color: string
  price: number
  timesChanged: number
}

export interface CanvasState {
  width: number
  height: number
  pixels: Map<string, PixelData>
}

// WebSocket message types
export interface PixelUpdateMessage {
  type: 'PIXEL_UPDATE'
  payload: {
    boardId: string
    x: number
    y: number
    color: string
    newPrice: number
    userId: string
  }
}

export interface UserCreditsMessage {
  type: 'CREDITS_UPDATE'
  payload: {
    userId: string
    newCredits: number
  }
}

export interface BoardStateMessage {
  type: 'BOARD_STATE'
  payload: {
    boardId: string
    pixels: PixelData[]
  }
}

export interface PixelBatchUpdateMessage {
  type: 'PIXEL_BATCH_UPDATE'
  payload: {
    boardId: string
    updates: Array<{
      x: number
      y: number
      color: string
      newPrice: number
      userId: string
    }>
  }
}

export interface PixelUpdatesMessage {
  type: 'PIXEL_UPDATES'
  payload: {
    boardId: string
    updates: Array<{
      x: number
      y: number
      color: string
      price: number
      timesChanged: number
    }>
    syncTimestamp?: number
  }
}

export interface BoardRefreshMessage {
  type: 'BOARD_REFRESH'
  payload: {
    boardId: string
    pixels: PixelData[]
    reason: string
    syncTimestamp?: number
  }
}

export type WebSocketMessage = 
  | PixelUpdateMessage 
  | UserCreditsMessage 
  | BoardStateMessage 
  | PixelBatchUpdateMessage
  | PixelUpdatesMessage
  | BoardRefreshMessage

// API Response types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

export interface PaintPixelRequest {
  boardId: string
  x: number
  y: number
  color: string
}

export interface ReportPixelRequest {
  pixelId: string
  reason: string
}

// Authentication types
export interface AuthUser {
  id: string
  walletAddress: string
  credits: number
  isAdmin: boolean
  isTrusted: boolean
  trustedAt?: Date
  lastReportedAt?: Date
  createdAt: Date
  updatedAt: Date
}

// Leaderboard types
export interface LeaderboardEntry {
  id: string
  walletAddress: string
  isAdmin: boolean
  joinedAt: Date
  totalPixelsPainted: number
  totalCreditsSpent: number
  uniquePixelsOwned: number
  firstPaintAt: Date | null
  lastPaintAt: Date | null
  averagePixelCost: number
  rank: number
}

// Moderation types
export interface TrustedUser {
  id: string
  walletAddress: string
  trustedAt: Date | null
  trustedBy?: string
  moderationActions: number
  reports: number
}

export interface TrustedUserCandidate {
  id: string
  walletAddress: string
  createdAt: Date
  lastReportedAt: Date | null
  pixelHistory: number
  reports: number
  eligible: boolean
}

export interface ModerationReport {
  id: string
  reason: string
  status: string
  createdAt: Date
  reviewedAt?: Date
  reviewedBy?: string
  moderatorNotes?: string
  pixel: {
    id: string
    x: number
    y: number
    color: string
    board: {
      id: string
      name: string
    }
    lastChangedBy?: {
      walletAddress: string
    }
  }
  reporter: {
    walletAddress: string
  }
}

export interface CanvasResetRequest {
  boardId: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  reason: string
}

export interface ReportReviewRequest {
  approved: boolean
  moderatorNotes?: string
}

export interface TrustedUserRequest {
  userId: string
  reason: string
}

// Board creation types
export interface CreateBoardRequest {
  name: string
  width: number
  height: number
  startingPixelPrice?: number
  priceMultiplier?: number
}

export interface CreateReportRequest {
  pixelId: string
  reason: string
}

export interface TrustedUserPromotionRequest {
  userId: string
  reason: string
} 
  id: string
  walletAddress: string
  isAdmin: boolean
  joinedAt: Date
  totalPixelsPainted: number
  totalCreditsSpent: number
  uniquePixelsOwned: number
  firstPaintAt: Date | null
  lastPaintAt: Date | null
  averagePixelCost: number
  rank: number
}

// Moderation types
export interface TrustedUser {
  id: string
  walletAddress: string
  trustedAt: Date | null
  trustedBy?: string
  moderationActions: number
  reports: number
}

export interface TrustedUserCandidate {
  id: string
  walletAddress: string
  createdAt: Date
  lastReportedAt: Date | null
  pixelHistory: number
  reports: number
  eligible: boolean
}

export interface ModerationReport {
  id: string
  reason: string
  status: string
  createdAt: Date
  reviewedAt?: Date
  reviewedBy?: string
  moderatorNotes?: string
  pixel: {
    id: string
    x: number
    y: number
    color: string
    board: {
      id: string
      name: string
    }
    lastChangedBy?: {
      walletAddress: string
    }
  }
  reporter: {
    walletAddress: string
  }
}

export interface CanvasResetRequest {
  boardId: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  reason: string
}

export interface ReportReviewRequest {
  approved: boolean
  moderatorNotes?: string
}

export interface TrustedUserRequest {
  userId: string
  reason: string
}

// Board creation types
export interface CreateBoardRequest {
  name: string
  width: number
  height: number
  startingPixelPrice?: number
  priceMultiplier?: number
}

export interface CreateReportRequest {
  pixelId: string
  reason: string
}

export interface TrustedUserPromotionRequest {
  userId: string
  reason: string
} 