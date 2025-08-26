-- Add performance indexes to optimize common queries
-- Migration: Add performance indexes

-- Composite index for pixel lookups by board coordinates (most critical)
-- This replaces the existing simple index and handles the most frequent query
CREATE INDEX IF NOT EXISTS "pixels_board_coordinates_active_idx" 
ON "pixels" ("boardId", "x", "y", "isHidden") 
WHERE "isHidden" = false;

-- Index for pixel history queries by board and timestamp
CREATE INDEX IF NOT EXISTS "pixel_history_board_timestamp_idx" 
ON "pixel_history" ("boardId", "timestamp" DESC);

-- Index for pixel history queries by user and timestamp
CREATE INDEX IF NOT EXISTS "pixel_history_user_timestamp_idx" 
ON "pixel_history" ("userId", "timestamp" DESC);

-- Index for user wallet address lookups (authentication)
CREATE INDEX IF NOT EXISTS "users_wallet_address_idx" 
ON "users" ("walletAddress");

-- Index for admin user queries
CREATE INDEX IF NOT EXISTS "users_admin_status_idx" 
ON "users" ("isAdmin") 
WHERE "isAdmin" = true;

-- Index for trusted user queries
CREATE INDEX IF NOT EXISTS "users_trusted_status_idx" 
ON "users" ("isTrusted", "trustedAt") 
WHERE "isTrusted" = true;

-- Index for active boards
CREATE INDEX IF NOT EXISTS "boards_active_status_idx" 
ON "boards" ("isActive", "isFrozen", "endDate") 
WHERE "isActive" = true;

-- Index for board end date queries (for cleanup/archival)
CREATE INDEX IF NOT EXISTS "boards_end_date_idx" 
ON "boards" ("endDate") 
WHERE "endDate" IS NOT NULL;

-- Index for transaction queries by user and status
CREATE INDEX IF NOT EXISTS "transactions_user_status_idx" 
ON "transactions" ("userId", "status", "createdAt" DESC);

-- Index for pending transactions (for processing)
CREATE INDEX IF NOT EXISTS "transactions_pending_idx" 
ON "transactions" ("status", "createdAt") 
WHERE "status" = 'PENDING';

-- Index for reports by status and creation date
CREATE INDEX IF NOT EXISTS "reports_status_created_idx" 
ON "reports" ("status", "createdAt" DESC);

-- Index for pending reports (for moderation)
CREATE INDEX IF NOT EXISTS "reports_pending_idx" 
ON "reports" ("status", "createdAt") 
WHERE "status" = 'PENDING';

-- Index for reports by pixel (for duplicate checking)
CREATE INDEX IF NOT EXISTS "reports_pixel_reporter_idx" 
ON "reports" ("pixelId", "reporterId");

-- Index for moderation actions by moderator and timestamp
CREATE INDEX IF NOT EXISTS "moderation_actions_moderator_timestamp_idx" 
ON "moderation_actions" ("moderatorId", "createdAt" DESC);

-- Index for moderation actions by target user
CREATE INDEX IF NOT EXISTS "moderation_actions_target_user_idx" 
ON "moderation_actions" ("targetUserId", "createdAt" DESC) 
WHERE "targetUserId" IS NOT NULL;

-- Index for moderation actions by board
CREATE INDEX IF NOT EXISTS "moderation_actions_board_idx" 
ON "moderation_actions" ("boardId", "createdAt" DESC) 
WHERE "boardId" IS NOT NULL;

-- Index for settings lookups by key
CREATE INDEX IF NOT EXISTS "settings_key_idx" 
ON "settings" ("key");

-- Index for pixel recent changes (for analytics)
CREATE INDEX IF NOT EXISTS "pixels_recent_changes_idx" 
ON "pixels" ("lastChangedAt" DESC, "boardId");

-- Index for user credit lookups (for quick balance checks)
CREATE INDEX IF NOT EXISTS "users_credits_idx" 
ON "users" ("credits") 
WHERE "credits" > 0;

-- Partial index for pixels that have been changed multiple times (hotspots)
CREATE INDEX IF NOT EXISTS "pixels_hotspots_idx" 
ON "pixels" ("boardId", "timesChanged" DESC, "x", "y") 
WHERE "timesChanged" > 5;

-- Index for user registration date (for analytics)
CREATE INDEX IF NOT EXISTS "users_created_at_idx" 
ON "users" ("createdAt" DESC);

-- Remove old indexes that may be redundant
-- Note: Be careful with this in production - verify queries first
-- DROP INDEX IF EXISTS "pixels_boardId_x_y_idx"; -- replaced by composite index above
-- DROP INDEX IF EXISTS "pixels_boardId_isHidden_idx"; -- replaced by composite index above